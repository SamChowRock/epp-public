import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Pager, sameIds } from '../examples/paging-upgrade/pager.mjs';
import { createPracticeServer } from '../examples/paging-upgrade/server.mjs';
const item = n => ({ id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, originalText: `text${n}`, chineseIntent: null, createdAt: '2026-11-16T00:00:00.000Z' });
const page = (items, nextCursor = null) => ({ items, limit: 2, hasMore: nextCursor !== null, nextCursor });
test('failed page retains cursor; duplicate clicks/responses and terminal are inert', () => {
 const p = new Pager({limit:2}); p.reset('owner','q'); const a=p.begin(); assert.equal(p.begin(),null);
 assert.equal(p.accept(a,page([item(1),item(2)],'next')),true); assert.equal(p.accept(a,page([item(1)],'next')),false);
 const b=p.begin(); p.fail(b); assert.equal(p.cursor,'next'); assert.equal(p.items.length,2);
 const c=p.begin(); assert.equal(c.cursor,'next'); p.accept(c,page([item(3)])); assert.equal(p.begin(),null); assert.equal(p.items.length,3);
});
test('changed filter or identity suppresses late success and failure', () => {
 const p=new Pager({limit:2}); p.reset('a','old'); const old=p.begin(); p.reset('a','new'); assert.equal(p.accept(old,page([item(1)])),false);
 const newer=p.begin(); p.reset('b','new'); assert.equal(p.fail(newer),false); assert.deepEqual(p.items,[]);
});
test('malformed page and duplicate ID never partially commit', () => {
 const p=new Pager({limit:2}); p.reset('a',''); let r=p.begin();
 assert.throws(()=>p.accept(r,page([item(1)],''))); assert.deepEqual(p.items,[]); p.fail(r);
 r=p.begin(); p.accept(r,page([item(1),item(2)],'next')); r=p.begin();
 assert.throws(()=>p.accept(r,page([item(2)]))); assert.equal(p.cursor,'next'); assert.equal(p.items.length,2); p.fail(r);
 r=p.begin(); assert.throws(()=>p.accept(r,{...page([item(3)]),limit:3})); p.fail(r);
 r=p.begin(); assert.throws(()=>p.accept(r,page([{...item(3),originalText:3}]))); p.fail(r);
});
test('comparison is exact ordered IDs, including empty arrays',()=>{
 assert.equal(sameIds([],[]),true); assert.equal(sameIds([item(1),item(2)],[item(1),item(2)]),true);
 assert.equal(sameIds([item(1),item(2)],[item(2),item(1)]),false); assert.equal(sameIds([item(1)],[item(1),item(2)]),false);
});
const listen = server => new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const close = server => new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
async function fixture(t, options={}) {
 const seen=[];
 const upstream=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
 seen.push({url:req.url,headers:req.headers,body}); res.setHeader('Content-Type','application/json');res.setHeader('Set-Cookie',['session=opaque; HttpOnly; SameSite=Strict']);
 res.end(JSON.stringify(req.url.startsWith('/captures/page')?page([item(1)]):req.url.startsWith('/captures')?{items:Array.from({length:101},(_,i)=>item(i+1))}:{userId:'user',sessionId:'session'}));});});
 const targetPort=await listen(upstream); const proxy=createPracticeServer({targetPort,...options}); const port=await listen(proxy);
 t.after(async()=>{await close(proxy);await close(upstream);}); return {base:`http://127.0.0.1:${port}`,seen};
}
test('default proxy preserves old list, page query, credential headers and Set-Cookie',async t=>{
 const {base,seen}=await fixture(t); assert.equal((await (await fetch(base+'/captures')).json()).items.length,101);
 const r=await fetch(base+'/captures/page?q=a%20b&limit=2&cursor=opaque',{headers:{Cookie:'session=old',Origin:base}});
 assert.match(r.headers.get('set-cookie'),/HttpOnly/); assert.equal(r.status,200); assert.equal(seen.at(-1).url,'/captures/page?q=a%20b&limit=2&cursor=opaque');
 assert.equal(seen.at(-1).headers.cookie,'session=old'); assert.equal(seen.at(-1).headers.origin,base);
 assert.equal((await fetch(base+'/auth/me')).status,404); assert.equal((await fetch(base+'/auth/logout',{method:'POST'})).status,404);
 assert.equal((await fetch(base+'/captures',{method:'POST'})).status,404); assert.equal((await fetch(base+'/http://example.com')).status,404);
 const identity=await (await fetch(base+'/practice/identity')).json(); assert.equal(identity.userId,'10000000-0000-4000-8000-000000000001'); assert.equal(identity.sessionId,undefined);
});
test('cap and next-page failure are explicit independent opt-in simulations',async t=>{
 const {base,seen}=await fixture(t,{legacyCap:100,faultNextPageOnce:true});
 const cfg=await (await fetch(base+'/practice-config')).json(); assert.equal(cfg.legacyCap,100); assert.equal(cfg.faultNextPageOnce,true);
 assert.equal((await (await fetch(base+'/captures')).json()).items.length,100);
 assert.equal((await fetch(base+'/captures/page?limit=2')).status,200);
 assert.equal((await fetch(base+'/captures/page?limit=2&cursor=x')).status,503);
 assert.equal((await fetch(base+'/captures/page?limit=2&cursor=x')).status,200); assert.equal(seen.length,4);
});
test('session mode forwards login/logout/CSRF, gates fixed identity, preserves write headers',async t=>{
 const {base,seen}=await fixture(t,{sessionMode:true,csrfMode:true}); assert.equal((await fetch(base+'/practice/identity')).status,404);
 assert.equal((await fetch(base+'/auth/me')).status,200); assert.equal((await fetch(base+'/auth/csrf')).status,200);
 const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-EPP-Request':'1',Origin:base},body:'{"userId":"u","password":"synthetic"}'}); assert.equal(r.status,200);
 await fetch(base+'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':'token','X-Expected-Session':'session','X-EPP-Request':'1'},body:'{}'});
 assert.equal(seen.at(-1).headers['x-csrf-token'],'token'); assert.equal(seen.at(-1).headers['x-expected-session'],'session'); assert.equal(seen.at(-2).headers.origin,base);
});

test('cursor cycles and malformed timestamps are rejected before mutation',()=>{
 const p=new Pager({limit:2});p.reset('a','');let r=p.begin();p.accept(r,page([item(1),item(2)],'A'));r=p.begin();p.accept(r,page([item(3),item(4)],'B'));r=p.begin();
 assert.throws(()=>p.accept(r,page([item(5),item(6)],'A')));assert.equal(p.items.length,4);p.fail(r);r=p.begin();
 assert.throws(()=>p.accept(r,page([{...item(5),createdAt:'Nov 16 2026'}])));p.fail(r);r=p.begin();
 assert.throws(()=>p.accept(r,page([{...item(5),createdAt:'2026-02-31T00:00:00.000Z'}])));
});

test('wired read rechecks identity after response and binds expected session',async()=>{
 const {readForOwner}=await import('../examples/paging-upgrade/pager.mjs');let cleared=false,accepted=false,headers;
 const result=await readForOwner({owner:'old',sessionId:'session-old',path:'/captures/page',request:async(_path,options)=>{headers=options.headers;return page([item(1)]);},identify:async()=> 'new',isCurrent:()=>true,clearIdentity:()=>{cleared=true;},accept:()=>{accepted=true;}});
 assert.equal(headers['X-Expected-Session'],'session-old');assert.equal(result,false);assert.equal(cleared,true);assert.equal(accepted,false);
});
test('wired read suppresses filter change during identity recheck',async()=>{
 const {readForOwner}=await import('../examples/paging-upgrade/pager.mjs');let current=true,accepted=false;
 await readForOwner({owner:'same',path:'/captures',request:async()=>({items:[]}),identify:async()=>{current=false;return 'same';},isCurrent:()=>current,clearIdentity:()=>assert.fail(),accept:()=>{accepted=true;}});assert.equal(accepted,false);
});
test('invalid cursor requires explicit restart instead of repeating failed cursor',()=>{
 const p=new Pager({limit:2});p.reset('a','q');let t=p.begin();p.accept(t,page([item(1),item(2)],'expired'));t=p.begin();assert.equal(p.invalidate(t),true);assert.equal(p.begin(),null);assert.deepEqual(p.items,[]);assert.equal(p.requiresRestart,true);p.reset('a','q');assert.equal(p.begin().cursor,null);
});

test('wired read publishes only after the post-response identity confirmation',async()=>{
 const {readForOwner}=await import('../examples/paging-upgrade/pager.mjs');const events=[];
 const accepted=await readForOwner({owner:'same',path:'/captures',request:async()=>{events.push('read');return {items:[item(1)]};},identify:async()=>{events.push('identity');return 'same';},isCurrent:()=>true,clearIdentity:()=>assert.fail(),accept:result=>{assert.equal(result.items.length,1);events.push('accept');}});
 assert.equal(accepted,true);assert.deepEqual(events,['read','identity','accept']);
});

test('actual page starts a fresh identity check after blur/focus and ignores old check cleanup',async()=>{
 const elements=new Map(),events={};
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,value:'',textContent:'',replaceChildren(){}});return elements.get(id);};
 const saved={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const pending=[];
 globalThis.document={hidden:false,getElementById:element,addEventListener:(type,fn)=>events[type]=fn,createElement:()=>({append(){}})};
 globalThis.window={addEventListener:(type,fn)=>events[type]=fn};
 globalThis.fetch=async path=>path==='/practice-config'?{json:async()=>({sessionMode:false})}
  :{ok:true,status:200,json:()=>new Promise(resolve=>pending.push(resolve))};
 try {
  const source=(await readFile(new URL('../examples/paging-upgrade/page.mjs',import.meta.url),'utf8'))
   .replace("'./pager.mjs'",JSON.stringify(new URL('../examples/paging-upgrade/pager.mjs',import.meta.url).href));
  const loaded=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pending.length,1);
  events.blur();events.focus();await new Promise(resolve=>setImmediate(resolve));
  const identity={userId:'10000000-0000-4000-8000-000000000001'};
  // Settle the obsolete request first; its finally must not erase the new check.
  pending[0](identity);await loaded;
  assert.equal(pending.length,2,'focus must issue a check for the new view epoch');
  assert.equal(element('work').hidden,true);
  events.focus();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pending.length,2,'the new in-flight check is still shared');
  pending[1](identity);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(element('work').hidden,false);
  assert.match(element('status').textContent,/身份已确认/);
 } finally {
  for(const [key,value] of Object.entries(saved)) {if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
 }
});
test('incomplete traversal remains marked after later complete pages until restart',()=>{
 const p=new Pager({limit:2});p.reset('owner','');
 p.accept(p.begin(),{...page([item(1),item(2)],'next'),complete:false});
 p.accept(p.begin(),{...page([item(3)]),complete:true});
 assert.equal(p.complete,false);assert.equal(p.done,true);
 p.reset('owner','');assert.equal(p.complete,true);
 assert.throws(()=>p.accept(p.begin(),{...page([]),complete:'false'}));assert.deepEqual(p.items,[]);
});
