import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// A changed official endpoint must fail before making any local HTTP call.
test('local injection rejects a nonofficial URL before contacting its peer', async () => {
  const mod = await import('../examples/mail-delivery/boundaries.mjs').catch(() => ({}));
  assert.equal(typeof mod.localRequest, 'function');
  const request = mod.localRequest(3454, 'accepted');
  await assert.rejects(request('https://attacker.test/emails', {}), /OFFICIAL_ENDPOINT_REQUIRED/);
  await assert.rejects(request('https://api.resend.com/emails?other=1', {}), /OFFICIAL_ENDPOINT_REQUIRED/);
});
test('private input refuses readable files and symbolic links', async () => {
  const mod = await import('../examples/mail-delivery/boundaries.mjs').catch(() => ({}));
  assert.equal(typeof mod.readPrivate, 'function');
  const dir = await mkdtemp(join(tmpdir(), 'ch54-private-'));
  try {
    const file = join(dir, 'config.json');
    await writeFile(file, '{}', { mode: 0o644 });
    await assert.rejects(mod.readPrivate(file), /PRIVATE_FILE_REQUIRED/);
    await chmod(file, 0o600);
    assert.deepEqual(await mod.readPrivate(file), {});
    const { symlink } = await import('node:fs/promises');
    await symlink(file, join(dir, 'link'));
    await assert.rejects(mod.readPrivate(join(dir, 'link')));
  } finally { await rm(dir, {recursive:true,force:true}); }
});
test('local injection forwards exact adapter bytes only to its loopback peer', async () => {
  const { localRequest } = await import('../examples/mail-delivery/boundaries.mjs');
  const { createServer } = await import('node:http');
  let seen;
  const server=createServer(async(req,res)=>{
    let body='';for await(const b of req) body+=b;
    seen={url:req.url,body,authorization:req.headers.authorization,mode:req.headers['x-epp-local-mode']};
    res.writeHead(200,{'content-type':'application/json'}).end('{"id":"10000000-0000-4000-8000-000000000001"}');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const response=await localRequest(server.address().port,'lost')('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:'Bearer synthetic-only'},body:'{"to":["a54@example.test"]}'});
    assert.equal(response.status,200);await response.arrayBuffer();
    assert.deepEqual(seen,{url:'/emails',body:'{"to":["a54@example.test"]}',authorization:'Bearer synthetic-only',mode:'lost'});
  } finally {await new Promise(r=>server.close(r));}
});
test('a later early-event 204 replaces an earlier replay 400 in the shared response record', async () => {
  const mod=await import('../examples/mail-delivery/boundaries.mjs');
  assert.equal(typeof mod.saveResponse,'function');
  const dir=await mkdtemp(join(tmpdir(),'ch54-response-'));
  try{
    const file=join(dir,'last-response.json');
    await mod.saveResponse(file,'wrong-signature',400);
    await mod.saveResponse(file,'early-event',204);
    assert.deepEqual(await mod.readPrivate(file),{eventId:'early-event',status:204});
  }finally{await rm(dir,{recursive:true,force:true});}
});

// Real disposable-DB assertions run with the same explicit test DB gate as the suite.
import './database-env.mjs';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { DatabaseService } from '../dist/src/database.service.js';
import { AppLogger } from '../dist/src/app-logger.js';
async function labFixture(t) {
  const database=new DatabaseService({url:process.env.TEST_DATABASE_URL,poolMax:5,queryDebug:false},new AppLogger('error'),'epp-mail-receipts');
  const db=database.client,dir=await mkdtemp(join(tmpdir(),'ch54-ownership-'));
  const expected=new URL(process.env.TEST_DATABASE_URL).pathname.slice(1);
  const ids=[randomUUID(),randomUUID()], messageIds=[randomUUID(),randomUUID()];
  for(let n=0;n<2;n++) await db.verification_mail_attempts.create({data:{id:randomUUID(),outbox_id:ids[n],intent_id:randomUUID(),attempt_no:1,claim_id:randomUUID(),recipient:'a54@example.test',purpose:'register',provider:'resend',provider_scope:'local-ch54',address_epoch:0n,provider_message_id:messageIds[n]}});
  const c={database:expected,providerPort:3454,observerPort:3554,receiverPort:3354,smtpPort:1054,providerScope:'local-ch54',endpointScope:'local-ch54-receipts',apiKey:randomBytes(32).toString('hex'),secret:'whsec_'+randomBytes(32).toString('base64'),recipients:['a54@example.test','b54@example.test'],outboxIds:[ids[0]]};
  const file=join(dir,'lab.json');
  async function save(){await writeFile(file,JSON.stringify(c),{mode:0o600});}
  await save();
  t.after(async()=>{await db.verification_mail_events.deleteMany({where:{provider_message_id:{in:messageIds}}});await db.verification_mail_attempts.deleteMany({where:{outbox_id:{in:ids}}});await database.onModuleDestroy();await rm(dir,{recursive:true,force:true});});
  async function cli(action,...args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,['examples/mail-delivery/lab.mjs',action,file,expected,...args],{env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL}});let out='';p.stdout.on('data',b=>out+=b);p.stderr.resume();p.once('error',reject);p.once('exit',code=>resolve({code,out}));});}
  return {db,dir,ids,messageIds,c,cli,save};
}
test('replay refuses same-recipient provider identity owned by an untracked task before signing HTTP',async t=>{
  const f=await labFixture(t);let calls=0;
  const server=createServer((q,r)=>{calls++;q.resume();r.writeHead(204).end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  f.c.receiverPort=server.address().port;await f.save();
  const fixture=join(f.dir,'untracked.json');await writeFile(fixture,JSON.stringify({eventId:'local_'+randomUUID(),body:JSON.stringify({type:'email.bounced',created_at:new Date().toISOString(),data:{email_id:f.messageIds[1],to:['a54@example.test'],bounce:{type:'Permanent'}}}),headers:{}}),{mode:0o600});
  const result=await f.cli('replay',fixture);
  assert.equal(result.code,1);assert.equal(calls,0);
});
test('observer excludes another provider scope or endpoint with the same provider UUID',async t=>{
  const f=await labFixture(t);
  await f.db.verification_mail_events.create({data:{id:randomUUID(),provider:'resend',provider_scope:'other-scope',endpoint_scope:'other-endpoint',event_id:'local_'+randomUUID(),body_sha256:'a'.repeat(64),event_type:'email.sent',provider_message_id:f.messageIds[0],recipient:'a54@example.test',provider_occurred_at:new Date(),match_state:'unmatched',effect:'none'}});
  await f.db.verification_mail_events.create({data:{id:randomUUID(),provider:'resend',provider_scope:'local-ch54',endpoint_scope:'other-endpoint',event_id:'local_'+randomUUID(),body_sha256:'b'.repeat(64),event_type:'email.sent',provider_message_id:f.messageIds[0],recipient:'a54@example.test',provider_occurred_at:new Date(),match_state:'unmatched',effect:'none'}});
  const result=await f.cli('inspect');assert.equal(result.code,0);
  assert.deepEqual(JSON.parse(result.out).events,[]);
});
test('replay allows only the tracked bound identity or its exact unbound early record',async t=>{
  const f=await labFixture(t);let calls=0;
  const server=createServer((q,r)=>{calls++;q.resume();r.writeHead(204).end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  f.c.receiverPort=server.address().port;await f.save();
  const file=join(f.dir,'event.json');
  async function event(id,to=['a54@example.test']){await writeFile(file,JSON.stringify({eventId:'local_'+randomUUID(),body:JSON.stringify({type:'email.bounced',created_at:new Date().toISOString(),data:{email_id:id,to,bounce:{type:'Permanent'}}}),headers:{}}),{mode:0o600});}
  await event(f.messageIds[0]);assert.equal((await f.cli('replay',file)).code,0);assert.equal(calls,1);
  await event(randomUUID());assert.equal((await f.cli('replay',file)).code,1);assert.equal(calls,1);
  const a=await f.db.verification_mail_attempts.findFirstOrThrow({where:{outbox_id:f.ids[0]}});
  await f.db.verification_mail_attempts.update({where:{id:a.id},data:{provider_message_id:null}});
  const recordFile=join(f.dir,'provider-'+a.id+'.json');
  const record={attemptId:a.id,outboxId:a.outbox_id,recipient:a.recipient,providerMessageId:f.messageIds[0]};
  await writeFile(recordFile,JSON.stringify(record),{mode:0o600});
  await event(f.messageIds[0]);assert.equal((await f.cli('replay',file)).code,0);assert.equal(calls,2);
  // A forged early file cannot borrow an already-bound identity of an untracked task.
  await writeFile(recordFile,JSON.stringify({...record,providerMessageId:f.messageIds[1]}));
  await event(f.messageIds[1]);assert.equal((await f.cli('replay',file)).code,1);assert.equal(calls,2);
  await writeFile(recordFile,JSON.stringify({...record,outboxId:f.ids[1]}));
  await event(f.messageIds[0]);assert.equal((await f.cli('replay',file)).code,1);assert.equal(calls,2);
  await event(f.messageIds[0],['a54@example.test','b54@example.test']);assert.equal((await f.cli('replay',file)).code,1);assert.equal(calls,2);
});
