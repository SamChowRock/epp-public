// Local teaching tool: fixed login route, synthetic credentials, no session forwarding.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

function upstream(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error('Invalid upstream: use http://127.0.0.1:PORT without a path');
  }
  return url;
}
const credentials = JSON.stringify({
  userId:'e4141e41-5a7c-49b1-b741-41e4141e4141',
  password:'Chapter41-SYNTHETIC-WRONG-password!',
  label:'Chapter 41 synthetic observation',
});

export function createObservationServer({apiA='http://127.0.0.1:3341', apiB='http://127.0.0.1:3342'} = {}) {
  const targets = {a:upstream(apiA), b:upstream(apiB)};
  return http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
    const send = (status, value) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(value));
    };
    const expectedHost = `127.0.0.1:${req.socket.localPort}`;
    if (req.headers.host !== expectedHost) {req.resume();send(403,{code:'OBSERVATION_HOST_REJECTED'});return;}
    if (req.method === 'GET' && req.url === '/') {
      try {const html = await readFile(new URL('./index.html', import.meta.url));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}
      catch {send(500,{code:'OBSERVATION_PAGE_UNAVAILABLE'});}
      return;
    }
    if (req.method !== 'POST' || !['/api/a','/api/b'].includes(req.url)) {req.resume();send(404,{code:'NOT_FOUND'});return;}
    if (req.headers.origin !== `http://${expectedHost}`) {req.resume();send(403,{code:'OBSERVATION_ORIGIN_REJECTED'});return;}
    req.resume(); // Never forward caller-supplied body, credentials, cookies or proxy headers.
    const api = req.url.slice(-1), target = targets[api];
    const base = {api:api.toUpperCase(), port:Number(target.port)};
    const failure = code => send(502,{...base,status:null,code,retryAfter:null,requestId:null});
    const request = http.request({hostname:target.hostname,port:target.port,path:'/auth/login',method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(credentials),'X-Epp-Request':'1',Origin:req.headers.origin},
      timeout:15000}, response => {
      const chunks=[];let size=0;
      response.on('data', chunk => {size+=chunk.length;if(size>65536) {response.destroy();failure('OBSERVATION_RESPONSE_TOO_LARGE');} else chunks.push(chunk);});
      response.on('error',()=>failure('OBSERVATION_RESPONSE_INCOMPLETE'));
      response.on('end',()=>{
        let value;
        try {value=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {value=null;}
        const status=response.statusCode;
        // Preserve actual status even if the API returned a non-JSON response.
        send(status,{...base,status,code:typeof value?.code === 'string' ? value.code : null,
          retryAfter:response.headers['retry-after'] ?? null,
          requestId:response.headers['x-request-id'] ?? (typeof value?.requestId === 'string' ? value.requestId : null)});
      });
    });
    request.on('timeout',()=>request.destroy());
    request.on('error',()=>failure('OBSERVATION_UPSTREAM_UNAVAILABLE'));
    res.on('close',()=>request.destroy());
    request.end(credentials); // Exactly one attempt; no redirects or retries.
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') throw Error('Local observation tool only');
  const port=Number(process.env.PORT ?? 8341);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
  const apiA=process.env.AUTH_LIMIT_API_A ?? 'http://127.0.0.1:3341';
  const apiB=process.env.AUTH_LIMIT_API_B ?? 'http://127.0.0.1:3342';
  if ([upstream(apiA),upstream(apiB)].some(url=>Number(url.port)===port)) throw Error('Page PORT must differ from upstream');
  createObservationServer({apiA,apiB}).listen(port,'127.0.0.1',()=>console.log(`Observation: http://127.0.0.1:${port}; A ${apiA}; B ${apiB}`));
}
