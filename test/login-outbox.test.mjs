import './auth-rate-test-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { SessionService } from '../dist/src/session.service.js';
import { MiniService } from '../dist/src/mini.service.js';
import { ApplicationState } from '../dist/src/application-state.js';
import { hashPassword } from '../dist/src/password.js';
import { removeTestCaptures } from './cleanup.mjs';

test('merged HTTP module queues recovery and preserves messages across mini channels, eligibility and targeted revocation', async t => {
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  const database = app.get(DatabaseService), db = database.client;
  const ids = [randomUUID(), randomUUID()], email = randomUUID()+'@example.test', captures = [];
  const password = 'Fictional chapter fifty password';
  t.after(async () => {
    try {
      await removeTestCaptures(db, captures, new Set());
      await db.verificationOutbox.deleteMany({where:{recipient:email}});
      await db.verificationIntent.deleteMany({where:{email}});
      await db.verifiedEmail.deleteMany({where:{email}});
      await db.wechatIdentity.deleteMany({where:{userId:{in:ids}}});
      await db.session.deleteMany({where:{userId:{in:ids}}});
      await db.passwordCredential.deleteMany({where:{userId:{in:ids}}});
      await db.user.deleteMany({where:{id:{in:ids}}});
    } finally { await app.close(); }
  });
  const hash = await hashPassword(password);
  for (const id of ids) await db.user.create({data:{id,webEnabled:true,miniEnabled:true,passwordCredential:{create:{passwordHash:hash}}}});
  await db.verifiedEmail.create({data:{userId:ids[0],email}});
  async function request(path, headers = {}, method = 'GET', body) {
    const r = await fetch((await app.getUrl())+path,{method,headers:{'X-EPP-Request':'1',...(body ? {'Content-Type':'application/json'}:{}),...headers},...(body ? {body:JSON.stringify(body)}:{})});
    const text = await r.text(); return {status:r.status,headers:r.headers,body:text ? JSON.parse(text):null};
  }
  const queued = await request('/auth/reset/request',{},'POST',{email}); assert.equal(queued.status,202);
  const job = await db.verificationOutbox.findFirstOrThrow({where:{recipient:email}});
  assert.equal(job.status,'pending');
  const intent = await db.verificationIntent.findUniqueOrThrow({where:{id:job.intentId}});
  assert.equal(intent.userId,ids[0]); assert.equal(job.generation,intent.tokenDigest);
  const login = await request('/auth/login',{},'POST',{userId:ids[0],password,label:'Original Web'});
  assert.equal(login.status,200); const cookie = login.headers.get('set-cookie').split(';')[0];
  const csrf = (await request('/auth/csrf',{Cookie:cookie})).body.csrfToken;
  const created = await request('/captures',{Cookie:cookie,'X-CSRF-Token':csrf},'POST',{originalText:'Original unified delivery material.'});
  assert.equal(created.status,201); captures.push(created.body.id);
  assert.equal((await request('/auth/mini/login',{},'POST',{code:'unused'})).body.code,'MINI_NOT_CONFIGURED');
  assert.equal((await request('/auth/mini/link',{},'POST',{code:'unused',userId:ids[0],password:'wrong'})).body.code,'AUTH_REQUIRED');
  assert.equal((await request('/auth/mini/link',{},'POST',{code:'unused',userId:ids[0],password})).body.code,'MINI_NOT_CONFIGURED');
  const local = new MiniService(database,app.get(SessionService),app.get(ApplicationState),{async exchange(code){return {appId:'wx0000000000000050',openId:code};}});
  const a = await local.link({userId:ids[0],password,code:'a',label:'A mini'}), b = await local.link({userId:ids[1],password,code:'b',label:'B mini'});
  const bearer = token => ({Authorization:'Bearer '+token});
  assert.deepEqual((await request('/captures/'+created.body.id,bearer(a.token))).body,created.body);
  assert.equal((await request('/captures/'+created.body.id,bearer(b.token))).status,404);
  assert.equal((await request('/auth/me',{Cookie:'epp_session='+a.token})).status,401);
  assert.equal((await request('/auth/me',bearer(cookie.split('=')[1]))).status,401);
  assert.equal((await request('/auth/me',{Cookie:cookie,...bearer(a.token)})).body.code,'AUTH_AMBIGUOUS');
  assert.equal((await request('/auth/csrf',bearer(a.token))).body.code,'SESSION_CHANNEL_DENIED');
  await db.user.update({where:{id:ids[0]},data:{miniEnabled:false}});
  assert.equal((await request('/captures/'+created.body.id,bearer(a.token))).status,403);
  assert.equal((await request('/captures/'+created.body.id,{Cookie:cookie})).status,200);
  await db.user.update({where:{id:ids[0]},data:{miniEnabled:true}});
  assert.equal((await request('/captures/'+created.body.id,bearer(a.token))).status,200);
  assert.equal((await request('/auth/sessions/'+a.sessionId,{Cookie:cookie,'X-CSRF-Token':csrf},'DELETE')).status,204);
  assert.equal((await request('/auth/me',bearer(a.token))).status,401);
  assert.equal((await request('/auth/me',{Cookie:cookie})).status,200);
  assert.equal((await request('/auth/me',bearer(b.token))).status,200);
  assert.deepEqual(await db.verificationOutbox.findUniqueOrThrow({where:{id:job.id}}),job);
  assert.deepEqual(await db.verificationIntent.findUniqueOrThrow({where:{id:intent.id}}),intent);
});
