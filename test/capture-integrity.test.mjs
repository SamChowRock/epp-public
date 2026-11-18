import './auth-rate-test-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../dist/src/app.js';
import { sessionFetch } from './session-fixture.mjs';
import { DatabaseService } from '../dist/src/database.service.js';
import { DEVELOPMENT_USER_ID } from '../dist/src/database-config.js';

test('missing revisions stay local: startup, explicit list completeness, owned detail and writes', async t => {
 const raw=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await raw.connect();
 const id=randomUUID(), healthy=randomUUID(), other=randomUUID();
 await raw.query('INSERT INTO public.users(id,web_enabled) VALUES($1,true)',[other]);
 await raw.query('INSERT INTO public.captures(id,user_id,original_text) VALUES($1,$2,$3)',[id,DEVELOPMENT_USER_ID,'No trustworthy revision']);
 let app; const sessionCleanups=[];
 t.after(async()=>{await raw.query('DELETE FROM public.capture_integrity_cases WHERE capture_id=$1',[id]).catch(()=>{});await raw.query('DELETE FROM public.capture_revisions WHERE capture_id=ANY($1::uuid[])',[[id,healthy]]);await raw.query('DELETE FROM public.captures WHERE id=ANY($1::uuid[])',[[id,healthy]]);for(const clean of sessionCleanups)await clean();await app?.close().catch(()=>{});await raw.query('DELETE FROM public.sessions WHERE user_id=$1',[other]);await raw.query('DELETE FROM public.users WHERE id=$1',[other]);await raw.end();});
 app=await createApp();await app.init();
 const db=app.get(DatabaseService).client;
 await db.capture.create({data:{id:healthy,userId:DEVELOPMENT_USER_ID,originalText:'healthy66',revisions:{create:{id:randomUUID(),revisionNo:1,originalText:'healthy66',inputSource:'manual'}}}});
 // Register cleanup before app closes (test callbacks run in registration order).
 const own=await sessionFetch({after:f=>sessionCleanups.push(f)},app),foreign=await sessionFetch({after:f=>sessionCleanups.push(f)},app,other);
 await app.listen(0,'127.0.0.1');const base=await app.getUrl();
 const call=async(f,path,method='GET',body,key)=>{const r=await f(base+path,{method,headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
 for(const suffix of ['', '?q=absent', '?limit=1'])assert.equal((await call(own,'/captures'+suffix)).status,503);
 const page=await call(own,'/captures/page?q=healthy66');assert.equal(page.status,200);assert.equal(page.body.complete,false);assert.ok(page.body.items.some(x=>x.id===healthy));
 assert.equal((await call(foreign,'/captures/page')).body.complete,true);
 for(const suffix of ['', '/revisions','/revisions?before=1']){assert.equal((await call(own,'/captures/'+id+suffix)).body.code,'CAPTURE_DATA_UNAVAILABLE');assert.equal((await call(foreign,'/captures/'+id+suffix)).status,404);}
 assert.equal((await call(own,'/captures/'+healthy)).status,200);
 assert.deepEqual((await call(own,'/captures/'+healthy+'/revisions?before=1')).body.items,[]);
 for(const key of [undefined,randomUUID()])assert.equal((await call(own,'/captures/'+id+'/revisions','POST',{originalText:'cannot fabricate history',chineseIntent:null},key)).status,503);
 assert.equal((await call(own,'/captures/'+id,'PATCH',{chineseIntent:'cannot fabricate history'})).status,503);
 assert.equal((await raw.query('SELECT count(*)::int n FROM public.capture_revisions WHERE capture_id=$1',[id])).rows[0].n,0);
});
test('startup rejects a same-name ownership foreign key on the wrong source column',async()=>{
 const c=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await c.connect();
 const definition=(await c.query("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='public.captures'::regclass AND conname='captures_user_id_fkey'")).rows[0].d;
 let app;
 try{
  await c.query('BEGIN');await c.query('ALTER TABLE public.captures DROP CONSTRAINT captures_user_id_fkey');
  await c.query('ALTER TABLE public.captures ADD COLUMN integrity_owner_probe uuid');
  await c.query('ALTER TABLE public.captures ADD CONSTRAINT captures_user_id_fkey FOREIGN KEY(integrity_owner_probe) REFERENCES public.users(id)');await c.query('COMMIT');
  app=await createApp();await assert.rejects(()=>app.init());
 }finally{
  await app?.close().catch(()=>{});await c.query('BEGIN');await c.query('ALTER TABLE public.captures DROP CONSTRAINT captures_user_id_fkey');await c.query('ALTER TABLE public.captures DROP COLUMN integrity_owner_probe');await c.query('ALTER TABLE public.captures ADD CONSTRAINT captures_user_id_fkey '+definition);await c.query('COMMIT');await c.end();
 }
});
