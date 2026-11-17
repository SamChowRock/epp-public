import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const moduleUrl = new URL('../examples/shared-auth-limit/server.mjs', import.meta.url);
async function moduleUnderTest() {
  assert.ok(await readFile(moduleUrl, 'utf8').catch(() => ''), 'fixed observation server must exist');
  return import(moduleUrl);
}
async function listen(server, t) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t, handler) {
  const calls = [];
  const upstream = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    calls.push({url:req.url, headers:req.headers, body:JSON.parse(body)});
    if (handler) return handler(req, res);
    res.writeHead(429, {'Content-Type':'application/json', 'Retry-After':'17', 'X-Request-Id':'request-41'});
    res.end(JSON.stringify({code:'AUTH_RATE_LIMIT', requestId:'request-41'}));
  });
  const target = await listen(upstream, t);
  const {createObservationServer} = await moduleUnderTest();
  const page = await listen(createObservationServer({apiA:target, apiB:target}), t);
  return {page, target, calls};
}

test('rejects non-loopback, credentials, and upstream paths at startup', async () => {
  const {createObservationServer} = await moduleUnderTest();
  for (const apiA of ['https://127.0.0.1:3341','http://example.com:3341','http://127.0.0.2:3341','http://user:pass@127.0.0.1:3341','http://127.0.0.1:3341/anything','http://127.0.0.1:3341/?url=x']) {
    assert.throws(() => createObservationServer({apiA}), /upstream/i);
  }
});
test('forwards only fixed synthetic credentials, preserving Origin and actual result fields', async t => {
  const {page, target, calls} = await fixture(t);
  const res = await fetch(`${page}/api/a`, {method:'POST', headers:{Origin:page, Cookie:'private=secret', 'X-Forwarded-For':'198.51.100.22'}, body:'{"password":"do-not-forward"}'});
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), {api:'A', port:Number(new URL(target).port), status:429, code:'AUTH_RATE_LIMIT', retryAfter:'17', requestId:'request-41'});
  assert.equal(calls.length,1); assert.equal(calls[0].url,'/auth/login');
  assert.equal(calls[0].headers.origin,page);
  assert.equal(calls[0].headers['x-epp-request'],'1');
  assert.equal(calls[0].headers.cookie,undefined); assert.equal(calls[0].headers['x-forwarded-for'],undefined);
  assert.match(calls[0].body.userId,/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.equal(calls[0].body.password,'Chapter41-SYNTHETIC-WRONG-password!');
});
test('rejects missing or foreign Origin and arbitrary routes before upstream', async t => {
  const {page,calls} = await fixture(t);
  for (const origin of [undefined,'http://localhost:8341','https://hostile.invalid']) {
    assert.equal((await fetch(`${page}/api/a`, {method:'POST',headers:origin ? {Origin:origin}: {}})).status,403);
  }
  for (const route of ['/api/a?url=http://hostile.invalid','/auth/login','/api/c','/http://127.0.0.1']) {
    assert.equal((await fetch(page+route,{method:'POST',headers:{Origin:page}})).status,404);
  }
  assert.equal(calls.length,0);
});
test('starts both upstream requests before either completes', {timeout:3000}, async t => {
  let arrivals = 0; const pending = [];
  const {page,calls} = await fixture(t, (_req,res) => {
    arrivals++; pending.push(res);
    if(arrivals===2) for(const response of pending) {response.writeHead(401,{'Content-Type':'application/json'});response.end('{"code":"AUTH_INVALID"}');}
  });
  const results = await Promise.all(['a','b'].map(api=>fetch(`${page}/api/${api}`,{method:'POST',headers:{Origin:page}})));
  assert.deepEqual(results.map(r=>r.status),[401,401]); assert.equal(calls.length,2);
});
test('upstream connection failure is explicit and never retried', async t => {
  let calls=0;
  const {page} = await fixture(t, (req,_res) => {calls++;req.socket.destroy();});
  const res=await fetch(`${page}/api/b`,{method:'POST',headers:{Origin:page}});
  assert.equal(res.status,502);
  const result=await res.json(); assert.equal(result.status,null); assert.equal(result.code,'OBSERVATION_UPSTREAM_UNAVAILABLE');
  assert.equal(calls,1);
});

async function pageHarness(fetchImpl) {
  const html=await readFile(new URL('../examples/shared-auth-limit/index.html', import.meta.url),'utf8');
  const elements = new Map();
  const element=()=>({textContent:'',children:[],disabled:false,append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];},addEventListener(type,fn){this[type]=fn;}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,querySelectorAll(){return ['send-a','send-b','send-pair','clear'].map(id=>document.getElementById(id));}};
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document,fetch:fetchImpl,Date,Promise});
  await new Promise(resolve=>setImmediate(resolve));
  return elements;
}
test('page keeps dispatch order when concurrent B finishes first; clear only clears display', async () => {
  const pending=[];
  const elements=await pageHarness((url)=>new Promise(resolve=>pending.push({url,resolve})));
  const pair=elements.get('send-pair').click();
  assert.deepEqual(pending.map(p=>p.url),['/api/a','/api/b']);
  pending[1].resolve({json:async()=>({api:'B',port:3342,status:429,code:'AUTH_RATE_LIMIT',retryAfter:'13',requestId:'b'})});
  pending[0].resolve({json:async()=>({api:'A',port:3341,status:401,code:'AUTH_INVALID',retryAfter:null,requestId:'a'})});
  await pair;
  const rows=elements.get('results').children;
  assert.equal(rows.length,2);
  assert.match(rows[0].textContent,/1.*A.*3341.*401.*AUTH_INVALID.*a/);
  assert.match(rows[1].textContent,/2.*B.*3342.*429.*AUTH_RATE_LIMIT.*13.*b/);
  assert.match(elements.get('comparison').textContent,/401.*429/);
  await elements.get('clear').click(); assert.equal(elements.get('results').children.length,0); assert.equal(pending.length,2);
});
test('page displays transport failure once without retrying', async () => {
  let calls=0;
  const elements=await pageHarness(async()=>{calls++;throw Error('offline');});
  await elements.get('send-a').click();
  assert.equal(calls,1); assert.match(elements.get('results').children[0].textContent,/未取得API响应/);
});
