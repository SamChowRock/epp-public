import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanObjects, observeHead, observerConfig, compare, html, writePrivate } from '../database/chapter-61-reconcile/lib.mjs';
const id = '00000000-0000-4000-8000-000000000001';
const key = `avatars/${id}.webp`;
const source = {endpoint:'http://127.0.0.1:18633',bucket:'avatars',prefix:'avatars/'};
const object = {key,size:1,lastModified:null,etag:'"x"'};
const clock = '2026-11-17T00:00:00.000Z';
const db = () => ({format:'epp-avatar-db/v1',source:{host:'localhost',port:5432,database:'verify',role:'observer'},startedAt:clock,endedAt:clock,databaseClock:clock,complete:true,terminal:{users:true,attempts:true},pages:{users:[],attempts:[]},users:[{id,avatar_id:id}],attempts:[]});
const objects = () => ({format:'epp-avatar-objects/v1',source,startedAt:clock,endedAt:clock,complete:true,terminal:true,pages:[],objects:[{...object}]});
const scan = (send, maxPages=10) => scanObjects({send},source,1,maxPages);
test('two pages retain exact keys and terminal marker', async()=>{let n=0; const m=await scan(async command=>{assert.equal(command.input.Prefix,'avatars/'); return ++n===1?{Contents:[{Key:key,Size:1}],IsTruncated:true,NextContinuationToken:'opaque+/='}:{Contents:[{Key:'avatars/other',Size:2}],IsTruncated:false};}); assert.equal(m.complete,true); assert.equal(m.terminal,true); assert.equal(m.pages.length,2); assert.deepEqual(m.objects.map(o=>o.key),[key,'avatars/other']);});
test('empty final page is a complete scan',async()=>{const m=await scan(async()=>({IsTruncated:false}));assert.equal(m.complete,true);assert.equal(m.objects.length,0);});
for (const [name,send,max] of [
 ['missing token',async()=>({IsTruncated:true}),10],
 ['cycle',async()=>({IsTruncated:true,NextContinuationToken:'same'}),10],
 ['limit',async()=>({IsTruncated:true,NextContinuationToken:'next'}),1],
 ['failure',async()=>{throw Object.assign(new Error('SECRET'),{name:'AccessDenied'});},10],
]) test(name+' remains incomplete without exposing errors',async()=>{const m=await scan(send,max);assert.equal(m.complete,false);assert.equal(m.terminal,false);assert.ok(m.error);assert.ok(!JSON.stringify(m).includes('SECRET'));});
for(const [code,status,ok] of [[404,'missing',true],[403,'unverified',false],[undefined,'unverified',false]]) test('HEAD '+code,async()=>{const m=await observeHead({send:async()=>{throw {$metadata:{httpStatusCode:code},message:'SECRET'};}},source,id);assert.equal(m.status,status);assert.equal(m.ok,ok);assert.ok(!JSON.stringify(m).includes('SECRET'));});
test('HEAD present',async()=>assert.equal((await observeHead({send:async()=>({})},source,id)).status,'present'));
test('target mismatch rejected before making calls',()=>{assert.throws(()=>observerConfig('https://other','avatars',{RECONCILE_S3_ENDPOINT:source.endpoint,RECONCILE_S3_BUCKET:'avatars',RECONCILE_S3_ACCESS_KEY:'x',RECONCILE_S3_SECRET_KEY:'y'}));});
test('comparison distinguishes incomplete sides and exact noncanonical keys',()=>{let d=db(),o=objects();o.complete=false;o.terminal=false;o.objects=[];assert.equal(compare(d,o).rows[0].classification,'current-unverified');o=objects();o.objects.push({...object,key:'avatars/UPPER.webp'});d.complete=false;d.terminal.users=false;assert.equal(compare(d,o).rows.find(r=>r.key==='avatars/UPPER.webp').classification,'object-db-unverified');d=db();assert.equal(compare(d,o).rows.find(r=>r.key==='avatars/UPPER.webp').classification,'object-untracked-at-db-sample');o.objects=[];assert.equal(compare(d,o).rows[0].classification,'current-not-listed');});
test('tracked states kept and new object does not imply deletion',()=>{const d=db(),o=objects();d.users=[];d.attempts=[{id,user_id:id,state:'writing',created_at:clock,check_after:clock}];assert.equal(compare(d,o).rows[0].classification,'tracked-noncurrent-writing');assert.ok(!JSON.stringify(compare(d,o)).includes('safe-to-delete'));});
test('malformed manifests and wrong scope rejected',()=>{for(const mutate of [d=>d.format='x',d=>d.users[0].id='bad',d=>d.complete='yes']){const d=db();mutate(d);assert.throws(()=>compare(d,objects()));}const o=objects();o.source.prefix='other/';assert.throws(()=>compare(db(),o));o.source.prefix='avatars/';o.objects[0].key='other/key';assert.throws(()=>compare(db(),o));});
test('HTML escapes private object key and no remote assets',()=>{const o=objects();o.objects.push({...object,key:'avatars/<img onerror="x">'});const result=html(compare(db(),o));assert.ok(result.includes('&lt;img'));assert.ok(!result.includes('<img'));assert.ok(!result.includes('<script'));});
test('private output never clobbers',async()=>{const dir=await mkdtemp(join(tmpdir(),'epp61-'));try{const file=join(dir,'out.json');await writePrivate(file,'original');await assert.rejects(writePrivate(file,'replacement'));assert.equal(await readFile(file,'utf8'),'original');assert.equal((await stat(file)).mode & 0o777,0o600);}finally{await rm(dir,{recursive:true});}});

import { scanDatabase, databaseConfig } from '../database/chapter-61-reconcile/db.mjs';
test('DB target mismatch rejected before connecting',()=>assert.throws(()=>databaseConfig('verify','postgresql://u:secret@localhost/production')));
test('DB uses one read-only repeatable snapshot and terminal pages for both tables',async()=>{
  const calls=[];let u=0,a=0;const client={connect:async()=>{},end:async()=>{},query:async(sql,args)=>{calls.push(sql);if(sql.startsWith('SELECT current_database'))return {rows:[{database:'verify',role:'auditor',host:'127.0.0.1',port:5432,clock}]};if(sql.includes('FROM public.users'))return {rows:++u===1?[{id,avatar_id:id}]:[]};if(sql.includes('FROM public.avatar_writes'))return {rows:++a===1?[{id,user_id:id,state:'live',created_at:clock,check_after:null}]:[]};return {rows:[]};}};
  const m=await scanDatabase(client,'verify',1);assert.equal(m.complete,true);assert.equal(m.pages.users.length,2);assert.equal(m.pages.attempts.length,2);assert.equal(calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(calls.at(-1),'COMMIT');assert.equal(compare(m,objects()).rows[0].classification,'current-listed');
});
test('DB failure retains prior rows but never claims complete',async()=>{
  const client={connect:async()=>{},end:async()=>{},query:async sql=>{if(sql.startsWith('SELECT current_database'))return {rows:[{database:'verify',role:'auditor',host:'127.0.0.1',port:5432,clock}]};if(sql.includes('FROM public.users'))return {rows:[{id,avatar_id:id}]};if(sql.includes('FROM public.avatar_writes'))throw new Error('SECRET');return {rows:[]};}};
  const m=await scanDatabase(client,'verify',100);assert.equal(m.complete,false);assert.equal(m.users.length,1);assert.equal(m.terminal.users,true);assert.equal(m.terminal.attempts,false);assert.ok(!JSON.stringify(m).includes('SECRET'));
});
test('DB page limit keeps partial inventory',async()=>{
 const client={connect:async()=>{},end:async()=>{},query:async sql=>sql.startsWith('SELECT current_database')?{rows:[{database:'verify',role:'auditor',host:'127.0.0.1',port:5432,clock}]}:{rows:sql.includes('FROM public.users')?[{id,avatar_id:id}]:[]}};
 const m=await scanDatabase(client,'verify',1,1);assert.equal(m.complete,false);assert.equal(m.error,'PAGE_LIMIT');assert.equal(m.users.length,1);
});
test('incomplete users do not establish tracked attempt as noncurrent',()=>{const d=db();d.users=[];d.complete=false;d.terminal.users=false;d.attempts=[{id,user_id:id,state:'live',created_at:clock,check_after:null}];assert.equal(compare(d,objects()).rows[0].classification,'tracked-current-unverified-live');});
test('protocol failure on later page retains earlier exact keys and hides opaque token',async()=>{let n=0;const token='PRIVATE_TOKEN';const m=await scan(async cmd=>{if(++n===1)return {Contents:[{Key:key,Size:1}],IsTruncated:true,NextContinuationToken:token};assert.equal(cmd.input.ContinuationToken,token);throw new Error('secret');});assert.equal(m.objects.length,1);assert.equal(m.pages.length,1);assert.equal(m.complete,false);assert.ok(!JSON.stringify(m).includes(token));});
test('duplicate exact keys collapse while distinct case survives',async()=>{let n=0;const m=await scan(async()=>++n===1?{Contents:[{Key:key,Size:1}],IsTruncated:true,NextContinuationToken:'a'}:n===2?{Contents:[{Key:key,Size:2}],IsTruncated:true,NextContinuationToken:'b'}:{Contents:[{Key:'avatars/UPPER.webp',Size:3}],IsTruncated:false});assert.equal(m.objects.length,2);assert.equal(m.objects.find(x=>x.key===key).size,2);});
test('manifests reject credential or unknown source properties',()=>{const d=db();d.source.password='secret';assert.throws(()=>compare(d,objects()));});
