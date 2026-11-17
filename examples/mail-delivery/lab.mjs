// 本地模拟供应商。This author entry never runs from the production application.
import 'reflect-metadata';
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { readFile, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import nodemailer from 'nodemailer';
import { Webhook } from 'svix';
import { z } from 'zod';
import { readPrivate, writePrivate, replacePrivate, saveResponse, localRequest } from './boundaries.mjs';
import { DatabaseService } from '../../dist/src/database.service.js';
import { AppLogger } from '../../dist/src/app-logger.js';
import { parseDatabaseConfig } from '../../dist/src/database-config.js';
import { ResendDelivery } from '../../dist/src/resend-delivery.js';
import { sendOne } from '../../dist/src/verification-outbox.js';
const label = '本地模拟供应商';
const uuid = z.string().uuid().refine(s => s === s.toLowerCase());
const port = z.number().int().min(1024).max(65535);
const email = z.string().regex(/^[a-z0-9._+-]+@example\.test$/).max(150);
const configSchema = z.object({
  database: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
  providerPort: port, observerPort:port, receiverPort:port, smtpPort:port,
  providerScope:z.literal('local-ch54'), endpointScope:z.literal('local-ch54-receipts'),
  apiKey:z.string().min(32), secret:z.string().startsWith('whsec_'),
  recipients:z.array(email).min(1).max(10), outboxIds:z.array(uuid).max(30),
}).strict().refine(c => new Set([c.providerPort,c.observerPort,c.receiverPort,c.smtpPort]).size === 4);
async function database(expected) {
  const cfg = parseDatabaseConfig(process.env);
  const url = new URL(cfg.url);
  if (!['127.0.0.1','localhost'].includes(url.hostname)) throw Error('LOCAL_DATABASE_REQUIRED');
  const db = new DatabaseService(cfg,new AppLogger('error'),'epp-mail-receipts');
  try {
    const [r] = await db.client.$queryRaw`SELECT current_database() AS name`;
    if (r?.name !== expected) throw Error('DATABASE_MISMATCH');
    await db.onModuleInit();
    return db;
  } catch(e) { await db.onModuleDestroy(); throw e; }
}
async function readBounded(req) {
  const chunks=[]; let n=0;
  for await (const b of req) { n+=b.length; if(n>65536) throw Error('BODY_LIMIT'); chunks.push(b); }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
function closeLocalServer(server) {
  return new Promise(resolve => {
    const timeout=setTimeout(()=>server.closeAllConnections(),8000);timeout.unref();
    server.close(()=>{clearTimeout(timeout);resolve();});server.closeIdleConnections();
  });
}
function signed(c, body, eventId, bad=false) {
  const timestamp = Math.floor(Date.now()/1000).toString();
  return {'content-type':'application/json','svix-id':eventId,'svix-timestamp':timestamp,
    'svix-signature':new Webhook(bad ? 'whsec_'+randomBytes(32).toString('base64') : c.secret).sign(eventId,new Date(Number(timestamp)*1000),body)};
}
async function emit(c, fixture, bad=false) {
  const response=await fetch(`http://127.0.0.1:${c.receiverPort}/webhooks/resend`,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:signed(c,fixture.body,fixture.eventId,bad),body:fixture.body});
  await response.arrayBuffer();
  return response.status;
}
function fixture(messageId,recipient,type) {
  if(!['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained'].includes(type)) throw Error('EVENT_TYPE');
  return {eventId:'local_'+randomUUID(), body:JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:messageId,to:[recipient],...(type==='email.bounced'?{bounce:{type:'Permanent',subType:'General'}}:{})}})};
}
async function fixedAttempts(db,c) {
  return db.client.verification_mail_attempts.findMany({where:{outbox_id:{in:c.outboxIds},provider:'resend',provider_scope:c.providerScope,recipient:{in:c.recipients}},take:90,select:{id:true,outbox_id:true,recipient:true,provider:true,provider_scope:true,provider_message_id:true,address_epoch:true,send_outcome:true,binding_source:true}});
}
async function fixedProviderRecords(attempts,privateDir) {
  const records=[];
  for(const a of attempts) {
    try {
      const r=await readPrivate(join(privateDir,'provider-'+a.id+'.json'));
      if(r.attemptId!==a.id||r.outboxId!==a.outbox_id||r.recipient!==a.recipient) throw Error('FIXED_ATTEMPT_REQUIRED');
      const messageId=uuid.parse(r.providerMessageId);
      if(a.provider_message_id && messageId!==a.provider_message_id) throw Error('FIXED_ATTEMPT_REQUIRED');
      records.push({attemptId:a.id,providerMessageId:messageId,recipient:a.recipient});
    } catch(e) {if(e.code!=='ENOENT')throw e;}
  }
  return records;
}
async function requireReplayOwnership(db,c,privateDir,payload) {
  const id=uuid.parse(payload?.data?.email_id),to=payload?.data?.to;
  if(!Array.isArray(to)||to.length!==1||!c.recipients.includes(to[0])) throw Error('SYNTHETIC_RECIPIENT_REQUIRED');
  // An already-bound identity is authoritative, including outside our tracked list.
  const bound=await db.client.verification_mail_attempts.findFirst({where:{provider:'resend',provider_scope:c.providerScope,provider_message_id:id},select:{outbox_id:true,recipient:true}});
  if(bound) {
    if(!c.outboxIds.includes(bound.outbox_id)||bound.recipient!==to[0]) throw Error('FIXED_ATTEMPT_REQUIRED');
    return;
  }
  // Early lost responses have no binding yet: only this exact fixed attempt's
  // private provider record can establish the locally generated identity.
  const attempts=await fixedAttempts(db,c);
  const records=await fixedProviderRecords(attempts.filter(a=>!a.provider_message_id),privateDir);
  if(!records.some(r=>r.providerMessageId===id&&r.recipient===to[0])) throw Error('FIXED_ATTEMPT_REQUIRED');
}
async function snapshot(db,c,privateDir) {
  const ids=c.outboxIds;
  // Explicit projections only: no intent/token/digest/body/password/config values.
  const outbox=await db.client.verificationOutbox.findMany({where:{id:{in:ids}},select:{id:true,recipient:true,status:true,attempts:true,lastFailure:true}});
  const attempts=await fixedAttempts(db,c);
  const providerRecords=await fixedProviderRecords(attempts,privateDir);
  const events=await db.client.verification_mail_events.findMany({where:{provider:'resend',provider_scope:c.providerScope,endpoint_scope:c.endpointScope,OR:[{attempt_id:{in:attempts.map(a=>a.id)}},{provider_message_id:{in:[...attempts.flatMap(a=>a.provider_message_id?[a.provider_message_id]:[]),...providerRecords.map(r=>r.providerMessageId)]}}]},select:{id:true,provider:true,provider_scope:true,endpoint_scope:true,event_id:true,event_type:true,provider_message_id:true,attempt_id:true,match_state:true,effect:true,received_at:true}});
  const addresses=await db.client.verification_mail_addresses.findMany({where:{recipient:{in:c.recipients}},select:{recipient:true,epoch:true,blocked:true,blocked_event_id:true}});
  const releases=await db.client.verification_mail_releases.findMany({where:{recipient:{in:c.recipients}},select:{id:true,recipient:true,old_epoch:true,new_epoch:true,previous_blocked_event_id:true}});
  const control=await db.client.verificationMailControl.findUnique({where:{id:1}});
  return {label,control,outbox,attempts,providerRecords,events,addresses,releases};
}
const stringify=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2);
async function main() {
  const [action,file,expected,...args]=process.argv.slice(2);
  if(!file || !expected) throw Error('USAGE');
  const path=resolve(file);
  if(action==='init') {
    const db=await database(expected); await db.onModuleDestroy();
    if(args.length) throw Error('USAGE');
    await writePrivate(path,{database:expected,providerPort:3454,observerPort:3554,receiverPort:3354,smtpPort:1054,providerScope:'local-ch54',endpointScope:'local-ch54-receipts',apiKey:randomBytes(32).toString('hex'),secret:'whsec_'+randomBytes(32).toString('base64'),recipients:['a54@example.test','b54@example.test'],outboxIds:[]});
    console.log(label+': private config created (0600)'); return;
  }
  const c=configSchema.parse(await readPrivate(path));
  if(c.database!==expected) throw Error('DATABASE_MISMATCH');
  const db=await database(expected);
  let keeping=false;
  try {
    if(action==='track') {
      const [id]=args;uuid.parse(id);
      const row=await db.client.verificationOutbox.findUniqueOrThrow({where:{id}});
      if(!c.recipients.includes(row.recipient))throw Error('SYNTHETIC_RECIPIENT_REQUIRED');
      c.outboxIds=[...new Set([...c.outboxIds,id])];configSchema.parse(c);
      await replacePrivate(path,c);console.log(label+': tracked '+id);return;
    }
    if(action==='receipts-env') {
      const [destination]=args;if(!destination)throw Error('USAGE');
      const text='DATABASE_URL='+parseDatabaseConfig(process.env).url+'\nDB_POOL_MAX=5\nDB_QUERY_DEBUG=false\nRESEND_WEBHOOK_SECRET='+c.secret+'\nMAIL_PROVIDER_SCOPE='+c.providerScope+'\nMAIL_ENDPOINT_SCOPE='+c.endpointScope+'\nMAIL_RECEIPT_PORT='+c.receiverPort+'\n';
      const h=await open(destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await h.writeFile(text);}finally{await h.close();}console.log(label+': private receiver env created');return;
    }
    if(action==='admin-bind') {
      const [id,destination]=args;uuid.parse(id);if(!c.outboxIds.includes(id)||!destination)throw Error('USAGE');
      const a=await db.client.verification_mail_attempts.findFirstOrThrow({where:{outbox_id:id,provider:'resend',provider_scope:c.providerScope,recipient:{in:c.recipients}},orderBy:{attempt_no:'desc'}});
      const r=await readPrivate(join(dirname(path),'provider-'+a.id+'.json'));
      if(r.attemptId!==a.id||r.outboxId!==id||r.recipient!==a.recipient)throw Error('FIXED_ATTEMPT_REQUIRED');
      await writePrivate(destination,{attemptId:a.id,providerMessageId:uuid.parse(r.providerMessageId),providerScope:c.providerScope,actor:'local-operator',reason:label+' SMTP accepted and HTTP response lost',evidenceRef:'local-provider-'+a.id});
      console.log(label+': private bind input created; review then use real mail-admin');return;
    }
    if(action==='admin-release') {
      const [recipient,destination]=args;if(!c.recipients.includes(recipient)||!destination)throw Error('USAGE');
      const a=await db.client.verification_mail_addresses.findUniqueOrThrow({where:{recipient}});
      await writePrivate(destination,{id:randomUUID(),recipient,expectedEpoch:a.epoch.toString(),actor:'local-operator',reason:label+' reviewed synthetic incident'});
      console.log(label+': private release input created; review then use real mail-admin');return;
    }
    if(action==='inspect') {console.log(stringify(await snapshot(db,c,dirname(path))));return;}
    if(action==='send') {
      const [id,mode='accepted']=args; uuid.parse(id);
      if(!c.outboxIds.includes(id)) throw Error('FIXED_OUTBOX_REQUIRED');
      const job=await db.client.verificationOutbox.findUniqueOrThrow({where:{id}});
      if(!c.recipients.includes(job.recipient)) throw Error('SYNTHETIC_RECIPIENT_REQUIRED');
      const delivery=new ResendDelivery({apiKey:c.apiKey,from:'EPP local <sender@example.test>',providerScope:c.providerScope},localRequest(c.providerPort,mode));
      const result=await sendOne(db,delivery,id);
      console.log(label+': '+result);
      if(['unknown','paused','lost-after-send'].includes(result)) process.exitCode=2;
      return;
    }
    if(action==='event') {
      const [id,type,destination]=args; uuid.parse(id);
      if(!destination || !c.outboxIds.includes(id)) throw Error('FIXTURE_DESTINATION_REQUIRED');
      const a=await db.client.verification_mail_attempts.findFirstOrThrow({where:{outbox_id:id,provider:'resend',provider_scope:c.providerScope,recipient:{in:c.recipients}},orderBy:{attempt_no:'desc'}});
      if(!a.provider_message_id) throw Error('UNBOUND_USE_PROVIDER_RECORD');
      const f=fixture(a.provider_message_id,a.recipient,type);
      await writePrivate(destination,{...f,headers:signed(c,f.body,f.eventId)});
      console.log(label+': private event created');return;
    }
    if(action==='replay') {
      const [source,mode]=args;
      const f=z.object({eventId:z.string().min(1).max(200),body:z.string().max(65536),headers:z.record(z.string(),z.string())}).strict().parse(await readPrivate(source));
      const payload=JSON.parse(f.body);
      await requireReplayOwnership(db,c,dirname(path),payload);
      const status=await emit(c,f,mode==='wrong');
      const responseFile=join(dirname(path),'last-response.json');
      await saveResponse(responseFile,f.eventId,status);
      console.log(label+': HTTP '+status);
      return;
    }
    if(action==='serve') {
      if(args.length) throw Error('USAGE');
      const transport=nodemailer.createTransport({host:'127.0.0.1',port:c.smtpPort,secure:false,ignoreTLS:true,connectionTimeout:2000,greetingTimeout:2000,socketTimeout:3000});
      const provider=http.createServer(async(req,res)=>{
        try {
          if(req.method!=='POST'||req.url!=='/emails'){res.writeHead(404).end();return;}
          if(req.headers.authorization!=='Bearer '+c.apiKey){res.writeHead(401).end();return;}
          const mode=req.headers['x-epp-local-mode'];
          if(!['accepted','lost','early'].includes(mode)) throw Error('MODE');
          const m=await readBounded(req);
          if(m.from!=='EPP local <sender@example.test>' || !Array.isArray(m.to) || m.to.length!==1 || !c.recipients.includes(m.to[0]) || typeof m.text!=='string' || typeof m.subject!=='string') throw Error('SYNTHETIC_MAIL_REQUIRED');
          const attemptId=uuid.parse(m.headers?.['X-EPP-Attempt-ID']);
          const a=await db.client.verification_mail_attempts.findUniqueOrThrow({where:{id:attemptId}});
          if(!c.outboxIds.includes(a.outbox_id)||a.recipient!==m.to[0]||a.provider!=='resend'||a.provider_scope!==c.providerScope) throw Error('FIXED_ATTEMPT_REQUIRED');
          const messageId=randomUUID();
          // The same identity survives SMTP acceptance and deliberately lost HTTP response.
          await transport.sendMail({from:m.from,to:m.to,subject:'['+label+'] '+m.subject,text:m.text,headers:{'X-EPP-Attempt-ID':attemptId,'X-EPP-Local-Provider-ID':messageId}});
          await writePrivate(join(dirname(path),'provider-'+attemptId+'.json'),{attemptId,providerMessageId:messageId,outboxId:a.outbox_id,recipient:a.recipient});
          if(mode==='early') {
            const f=fixture(messageId,a.recipient,'email.bounced');
            await writePrivate(join(dirname(path),'early-'+attemptId+'.json'),{...f,headers:signed(c,f.body,f.eventId)});
            await saveResponse(join(dirname(path),'last-response.json'),f.eventId,await emit(c,f));
          }
          if(mode!=='accepted'){res.destroy();return;}
          res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({id:messageId}));
        } catch {if(!res.destroyed) res.writeHead(400).end();}
      });
      const page=await readFile(new URL('./observer.html',import.meta.url));
      const observer=http.createServer(async(req,res)=>{
        if(req.method!=='GET'||!['/','/snapshot'].includes(req.url)){res.writeHead(404).end();return;}
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
        if(req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(page);return;}
        try {let lastResponse=null;try{const rr=await readPrivate(join(dirname(path),'last-response.json'));lastResponse={eventId:z.string().max(200).parse(rr.eventId),status:z.number().int().min(100).max(599).parse(rr.status)};}catch(e){if(e.code!=='ENOENT')throw e;}res.writeHead(200,{'content-type':'application/json; charset=utf-8'}).end(stringify({...await snapshot(db,c,dirname(path)),lastHttp:lastResponse}));} catch {res.writeHead(503).end('{"error":"OBSERVATION_UNAVAILABLE"}');}
      });
      await new Promise((ok,no)=>{provider.once('error',no);provider.listen(c.providerPort,'127.0.0.1',ok);});
      try {await new Promise((ok,no)=>{observer.once('error',no);observer.listen(c.observerPort,'127.0.0.1',ok);});}catch(e){await closeLocalServer(provider);transport.close();throw e;}
      keeping=true;
      console.log(label+`: provider 127.0.0.1:${c.providerPort}; observer http://127.0.0.1:${c.observerPort}`);
      let closing=false;
      for(const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{
        if(closing)return;closing=true;
        const timer=setTimeout(()=>process.exit(1),10000);timer.unref();
        await Promise.all([provider,observer].map(closeLocalServer));transport.close();
        await db.onModuleDestroy();clearTimeout(timer);
      });
      return;
    }
    throw Error('USAGE');
  } finally {if(!keeping) await db.onModuleDestroy();}
}
main().catch(()=>{console.error(label+': LAB_FAILED (check expected database, private input and fixed IDs)');process.exitCode=1;});
