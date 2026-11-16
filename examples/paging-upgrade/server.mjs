// Development-only, fixed loopback upstream; only enumerated paths are forwarded.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export function createPracticeServer({targetPort,sessionMode=false,csrfMode=false,faultNextPageOnce=false,legacyCap=null}) {
 if(!Number.isInteger(targetPort)||targetPort<1||targetPort>65535) throw Error('Invalid TARGET_PORT');
 if(legacyCap!==null&&legacyCap!==100) throw Error('LEGACY_CAP only supports 100');
 if(csrfMode&&!sessionMode) throw Error('CSRF_MODE requires SESSION_MODE');
 let failed=false;
 const assets=new Map([['/',['index.html','text/html']],['/page.mjs',['page.mjs','text/javascript']],['/pager.mjs',['pager.mjs','text/javascript']]]);
 return http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const path=req.url??'';
  if(req.method==='GET'&&assets.has(path)) {const [file,type]=assets.get(path);try{res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`});res.end(await readFile(new URL(file,import.meta.url)));}catch{res.end();}return;}
  if(req.method==='GET'&&path==='/practice-config') {send(200,{sessionMode,csrfMode,faultNextPageOnce,legacyCap});return;}
  if(req.method==='GET'&&path==='/practice/identity'&&!sessionMode) {send(200,{userId:'10000000-0000-4000-8000-000000000001',mode:'fixed-stage-declaration'});return;}
  const captures=req.method==='GET'&&/^\/captures(?:\/page)?(?:\?[^#]*)?$/.test(path);
  const auth=sessionMode&&((req.method==='GET'&&['/auth/me','/auth/csrf'].includes(path))||(req.method==='POST'&&['/auth/login','/auth/logout'].includes(path)));
  if(!captures&&!auth) {send(404,{code:'NOT_FOUND'});return;}
  const headers={};for(const name of ['content-type','content-length','cookie','origin','x-epp-request','x-csrf-token','x-expected-session']) if(req.headers[name]!==undefined) headers[name]=req.headers[name];
  const upstream=http.request({host:'127.0.0.1',port:targetPort,path,method:req.method,headers,timeout:15000},result=>{
   const url=new URL(path,'http://127.0.0.1');
   const fault=faultNextPageOnce&&!failed&&url.pathname==='/captures/page'&&url.searchParams.has('cursor')&&result.statusCode===200;
   const cap=legacyCap!==null&&url.pathname==='/captures'&&result.statusCode===200;
   const forwardHeaders=()=>{for(const name of ['content-type','set-cookie']) if(result.headers[name]!==undefined)res.setHeader(name,result.headers[name]);};
   if(fault||cap){
    if(fault) failed=true;
    const chunks=[];let size=0;
    result.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024){result.destroy();return;}chunks.push(chunk);});
    result.on('end',()=>{if(fault){send(503,{code:'SIMULATED_NEXT_PAGE_FAILURE',message:'隔离代理一次续页失败；上游读取已完成。'});return;}
     try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||!Array.isArray(value.items))throw Error();forwardHeaders();send(200,{...value,items:value.items.slice(0,legacyCap)});}catch{send(502,{code:'BAD_UPSTREAM'});}});
   }else{forwardHeaders();res.writeHead(result.statusCode??502);result.pipe(res);}
   result.on('error',()=>{if(!res.headersSent)send(502,{code:'UPSTREAM_FAILURE'});else res.destroy();});
  });
  upstream.on('timeout',()=>upstream.destroy());
  upstream.on('error',()=>{if(!res.headersSent)send(502,{code:'UPSTREAM_UNAVAILABLE'});else res.destroy();});
  req.on('aborted',()=>upstream.destroy());req.on('error',()=>upstream.destroy());req.pipe(upstream);
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 if(process.env.NODE_ENV==='production') throw Error('Development-only runner');
 const port=Number(process.env.PORT??3034),targetPort=Number(process.env.TARGET_PORT??3000);
 if(!Number.isInteger(port)||port<1||port>65535||port===targetPort)throw Error('Invalid PORT');
 const server=createPracticeServer({targetPort,sessionMode:process.env.SESSION_MODE==='true',csrfMode:process.env.CSRF_MODE==='true',faultNextPageOnce:process.env.FAULT_NEXT_PAGE_ONCE==='true',legacyCap:process.env.LEGACY_CAP===undefined?null:Number(process.env.LEGACY_CAP)});
 server.listen(port,'127.0.0.1',()=>console.log(`Paging practice: http://127.0.0.1:${port}; upstream loopback:${targetPort}`));
}
