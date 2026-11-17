import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { readFile, mkdir, open, rename, unlink, rm, lstat } from 'node:fs/promises';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { endpoint, demand, safeError } from './lib.mjs';
process.umask(0o077);
// A refused TCP connection is the only proof accepted here. This local helper
// is for a single-user lab: keep SeaweedFS stopped until it finishes.
async function stopped(port){await new Promise((res,rej)=>{const s=connect({host:'127.0.0.1',port});s.setTimeout(1000);s.once('connect',()=>{s.destroy();rej(new Error('INVALID_INPUT'));});s.once('timeout',()=>{s.destroy();rej(new Error('INVALID_INPUT'));});s.once('error',e=>e.code==='ECONNREFUSED'?res():rej(new Error('INVALID_INPUT')));});}
const dir=resolve('.chapter61-private'), config=resolve('.chapter51-store/s3.json'), temp=resolve('.chapter51-store/s3.chapter61.tmp');
let madeDir=false,madeTemp=false,madeLock=false;
const lock=resolve('.chapter51-store/chapter61.lock');
try{
  demand(process.argv.length===4);const [expectedEndpoint,expectedBucket]=process.argv.slice(2);
  const env=parseEnv(await readFile('.chapter51-store/admin.env','utf8'));
  endpoint(expectedEndpoint);demand(expectedEndpoint===env.AVATAR_S3_ENDPOINT&&expectedBucket==='avatars'&&env.AVATAR_S3_BUCKET===expectedBucket);
  const u=new URL(expectedEndpoint);demand(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port==='18633');
  for(const port of [18630,18631,18632,18633,18634,28630,28631,28632,28633,28634])await stopped(port);
  const lh=await open(lock,'wx',0o600);madeLock=true;await lh.close();
  demand((await lstat(config)).isFile() && !(await lstat(config)).isSymbolicLink());
  const original=await readFile(config,'utf8'), data=JSON.parse(original);demand(Array.isArray(data.identities)&&!data.identities.some(x=>x.name==='chapter61-observer'));
  await mkdir(dir,{mode:0o700});madeDir=true;
  const accessKey=randomBytes(12).toString('hex'),secretKey=randomBytes(32).toString('hex');
  data.identities.push({name:'chapter61-observer',actions:['List:avatars','Read:avatars'],credentials:[{accessKey,secretKey}]});
  const h=await open(temp,'wx',0o600);madeTemp=true;try{await h.writeFile(JSON.stringify(data));await h.sync();}finally{await h.close();}
  const out=await open(resolve(dir,'s3.env'),'wx',0o600);try{await out.writeFile(`RECONCILE_S3_ENDPOINT=${expectedEndpoint}\nRECONCILE_S3_BUCKET=${expectedBucket}\nRECONCILE_S3_ACCESS_KEY=${accessKey}\nRECONCILE_S3_SECRET_KEY=${secretKey}\n`);await out.sync();}finally{await out.close();}
  demand(await readFile(config,'utf8')===original);
  await rename(temp,config);madeTemp=false;madeDir=false;
  console.log('Created dedicated observer identity and private s3.env. Restart the local store.');
}catch(e){console.error(safeError(e));process.exitCode=1;}
finally{if(madeTemp)await unlink(temp);if(madeDir)await rm(dir,{recursive:true});if(madeLock)await unlink(lock);}
