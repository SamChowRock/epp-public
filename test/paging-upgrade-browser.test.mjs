import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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
