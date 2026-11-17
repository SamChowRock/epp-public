import './auth-rate-test-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
test('OIDC start reserves shared quota before parsing mode or proving link password',async t=>{
  const app=await createApp();t.after(()=>app.close());await app.listen(0,'127.0.0.1');
  const base=await app.getUrl();
  const request=(path,body)=>fetch(base+path,{method:'POST',headers:{'X-EPP-Request':'1','Content-Type':'application/json'},body:JSON.stringify(body)});
  for(let i=0;i<9;i++)assert.equal((await request('/auth/login',{userId:'00000000-0000-4000-8000-000000000050',password:'wrong'})).status,401);
  assert.equal((await request('/auth/oidc/start',{mode:'link',userId:'00000000-0000-4000-8000-000000000050',password:'wrong'})).status,401);
  for(const mode of ['link','login']){
    const r=await request('/auth/oidc/start',mode==='login'?{mode}:{mode,userId:'00000000-0000-4000-8000-000000000050',password:'wrong'});
    assert.equal(r.status,429);assert.equal((await r.json()).code,'AUTH_RATE_LIMIT');
  }
});
test('OIDC start fails closed when shared quota is unavailable before parsing or password proof',async t=>{
  const app=await createApp();t.after(()=>app.close());await app.listen(0,'127.0.0.1');const db=app.get(DatabaseService);
  await db.pool.query('ALTER TABLE auth_rate_buckets RENAME TO auth_rate_buckets_unavailable');
  try{const r=await fetch((await app.getUrl())+'/auth/oidc/start',{method:'POST',headers:{'X-EPP-Request':'1','Content-Type':'application/json'},body:'{'});
    assert.equal(r.status,503);assert.equal((await r.json()).code,'AUTH_RATE_UNAVAILABLE');
  }finally{await db.pool.query('ALTER TABLE auth_rate_buckets_unavailable RENAME TO auth_rate_buckets');}
});
