import './auth-rate-test-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
const input = { code:'unused', userId:'00000000-0000-4000-8000-000000000050', password:'wrong', label:'Quota proof' };
test('mini link shares password quota across APIs before proof; platform-only login keeps its own budget', async t => {
  const apps = [await createApp(), await createApp()];
  t.after(async()=>{for(const app of apps)await app.close();});
  for(const app of apps)await app.listen(0,'127.0.0.1');
  const urls=await Promise.all(apps.map(app=>app.getUrl()));
  const post=(i,path,body)=>fetch(urls[i%2]+path,{method:'POST',headers:{'X-EPP-Request':'1','Content-Type':'application/json'},body:JSON.stringify(body)});
  for(let i=0;i<10;i++){
    const r=await post(i,i%2?'/auth/mini/link':'/auth/login',i%2?input:{userId:input.userId,password:'wrong',label:'Quota proof'});
    assert.equal(r.status,401);
  }
  const refused=await post(0,'/auth/mini/link',input);
  assert.equal(refused.status,429); assert.equal((await refused.json()).code,'AUTH_RATE_LIMIT');
  const web=await post(1,'/auth/login',{userId:input.userId,password:'wrong'});assert.equal(web.status,429);
  const login=await post(0,'/auth/mini/login',{code:'unused'});
  assert.equal(login.status,503);assert.equal((await login.json()).code,'MINI_NOT_CONFIGURED');
});
test('mini link fails closed with unavailable shared quota before password work or body parsing',async t=>{
  const app=await createApp();t.after(()=>app.close());await app.listen(0,'127.0.0.1');
  const db=app.get(DatabaseService);
  await db.pool.query('ALTER TABLE auth_rate_buckets RENAME TO auth_rate_buckets_unavailable');
  try{
    const r=await fetch((await app.getUrl())+'/auth/mini/link',{method:'POST',headers:{'X-EPP-Request':'1','Content-Type':'application/json'},body:'{'});
    assert.equal(r.status,503);assert.equal((await r.json()).code,'AUTH_RATE_UNAVAILABLE');
  }finally{await db.pool.query('ALTER TABLE auth_rate_buckets_unavailable RENAME TO auth_rate_buckets');}
});
