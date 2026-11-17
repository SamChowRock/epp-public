import { open, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
export const now = () => new Date().toISOString();
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function demand(condition) { if (!condition) throw new Error('INVALID_INPUT'); }
export function integer(value, fallback, max) { const n=value===undefined?fallback:Number(value); demand(Number.isInteger(n)&&n>=1&&n<=max); return n; }
export function endpoint(value) {
  const u=URL.parse(value ?? '');
  demand(u && value===u.origin && (u.protocol==='https:' || (u.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname))));
  return value;
}
export function observerConfig(expectedEndpoint, expectedBucket, env=process.env) {
  const target={endpoint:endpoint(env.RECONCILE_S3_ENDPOINT),bucket:env.RECONCILE_S3_BUCKET,prefix:'avatars/'};
  demand(target.endpoint===expectedEndpoint && target.bucket===expectedBucket && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(target.bucket));
  demand(env.RECONCILE_S3_ACCESS_KEY && env.RECONCILE_S3_SECRET_KEY);
  return {...target,credentials:{accessKeyId:env.RECONCILE_S3_ACCESS_KEY,secretAccessKey:env.RECONCILE_S3_SECRET_KEY}};
}
// Only allowlisted codes escape the process; server messages may contain secrets.
export function safeError(e) {
  const status=e?.$metadata?.httpStatusCode;
  if(Number.isInteger(status)&&status>=100&&status<=599) return 'HTTP_'+status;
  const name=e?.code ?? e?.name;
  return ['AccessDenied','NoSuchBucket','NoSuchKey','NotFound','AbortError','TimeoutError','ECONNREFUSED','ECONNRESET','ENOTFOUND','EEXIST','INVALID_INPUT','PAGE_LIMIT','ROW_LIMIT','INVALID_PAGE','TOKEN_CYCLE','QUERY_FAILED','TARGET_MISMATCH'].includes(name)?name:'OBSERVATION_FAILED';
}
function fail(code){throw Object.assign(new Error(code),{code});}
export async function writePrivate(file, content) {
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  const handle=await open(file,'wx',0o600);
  try{await handle.writeFile(content);await handle.sync();}finally{await handle.close();}
}
export async function scanObjects(client, source, pageSize=100,maxPages=10000) {
  const m={format:'epp-avatar-objects/v1',source,startedAt:now(),endedAt:null,complete:false,terminal:false,pages:[],objects:[],error:null};
  const seen=new Set(), objects=new Map(); let token;
  try {
    for(let i=0;i<maxPages;i++) {
      const startedAt=now();
      const r=await client.send(new ListObjectsV2Command({Bucket:source.bucket,Prefix:'avatars/',MaxKeys:pageSize,...(token?{ContinuationToken:token}:{})}),{abortSignal:AbortSignal.timeout(15000)});
      demand(Array.isArray(r.Contents ?? []) && typeof r.IsTruncated==='boolean');
      const contents=r.Contents ?? [];
      if(contents.length>pageSize) fail('INVALID_PAGE');
      for(const o of contents){
        if(typeof o.Key!=='string'||!o.Key.startsWith('avatars/')||!Number.isSafeInteger(o.Size)||o.Size<0) fail('INVALID_PAGE');
        const row={key:o.Key,size:o.Size,lastModified:o.LastModified?new Date(o.LastModified).toISOString():null,etag:o.ETag??null};
        if(row.etag!==null&&typeof row.etag!=='string') fail('INVALID_PAGE');
        objects.set(o.Key,row);
      }
      m.pages.push({number:i+1,startedAt,endedAt:now(),count:contents.length,truncated:r.IsTruncated});
      if(objects.size>1000000) fail('ROW_LIMIT');
      if(!r.IsTruncated){m.terminal=true;m.complete=true;break;}
      if(typeof r.NextContinuationToken!=='string'||!r.NextContinuationToken) fail('INVALID_PAGE');
      if(seen.has(r.NextContinuationToken)) fail('TOKEN_CYCLE');
      seen.add(r.NextContinuationToken);token=r.NextContinuationToken;
    }
    if(!m.complete) fail('PAGE_LIMIT');
  }catch(e){m.error=safeError(e);}
  m.objects=[...objects.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);m.endedAt=now();return m;
}
export async function observeHead(client, source, id) {
  demand(uuid.test(id));
  try{await client.send(new HeadObjectCommand({Bucket:source.bucket,Key:`avatars/${id}.webp`}),{abortSignal:AbortSignal.timeout(15000)});return {status:'present',observedAt:now(),ok:true};}
  catch(e){const missing=e?.$metadata?.httpStatusCode===404;return {status:missing?'missing':'unverified',observedAt:now(),error:safeError(e),ok:missing};}
}
function only(value, names){demand(record(value)&&Object.keys(value).every(k=>names.includes(k)));}
const timestamp=v=>typeof v==='string' && !Number.isNaN(Date.parse(v));
const record=v=>v!==null && typeof v==='object' && !Array.isArray(v);
function observation(m,format){demand(record(m)&&m.format===format&&record(m.source)&&typeof m.complete==='boolean'&&timestamp(m.startedAt)&&timestamp(m.endedAt)&&m.startedAt<=m.endedAt);}
export function compare(d,o) {
  observation(d,'epp-avatar-db/v1'); observation(o,'epp-avatar-objects/v1');
  only(d,['format','source','startedAt','endedAt','databaseClock','complete','terminal','pages','users','attempts','error']);
  only(o,['format','source','startedAt','endedAt','complete','terminal','pages','objects','error']);
  only(d.source,['host','port','database','role']);only(o.source,['endpoint','bucket','prefix']);
  demand(typeof d.source.host==='string'&&Number.isInteger(d.source.port)&&typeof d.source.database==='string'&&typeof d.source.role==='string');
  demand(d.databaseClock===null||timestamp(d.databaseClock));
  endpoint(o.source.endpoint);demand(typeof o.source.bucket==='string'&&o.source.bucket.length>0&&o.source.prefix==='avatars/');
  demand(record(d.terminal)&&typeof d.terminal.users==='boolean'&&typeof d.terminal.attempts==='boolean'&&typeof o.terminal==='boolean');
  demand(!d.complete||(d.terminal.users&&d.terminal.attempts));demand(!o.complete||o.terminal);
  only(d.terminal,['users','attempts']);only(d.pages,['users','attempts']);
  demand(record(d.pages)&&Array.isArray(d.pages.users)&&Array.isArray(d.pages.attempts)&&Array.isArray(o.pages));
  for(const p of [...d.pages.users,...d.pages.attempts,...o.pages]) {
    only(p,['number','startedAt','endedAt','count','terminal','truncated']);
    demand(Number.isInteger(p.number)&&p.number>0&&Number.isInteger(p.count)&&p.count>=0&&timestamp(p.startedAt)&&timestamp(p.endedAt));
    demand(typeof (p.terminal??p.truncated)==='boolean');
  }
  for(const m of [d,o]) demand(m.error===undefined||m.error===null||(typeof m.error==='string'&&(safeError({code:m.error})===m.error||/^HTTP_[1-5][0-9]{2}$/.test(m.error))));
  demand(Array.isArray(d.users)&&Array.isArray(d.attempts)&&Array.isArray(o.objects));
  const rows=new Map();const get=key=>{if(!rows.has(key))rows.set(key,{key,currentUsers:[],attempts:[],object:null});return rows.get(key);};
  const users=new Set(),attempts=new Set(),keys=new Set();
  for(const u of d.users){only(u,['id','avatar_id']);demand(record(u)&&uuid.test(u.id)&&(u.avatar_id===null||uuid.test(u.avatar_id))&&!users.has(u.id));users.add(u.id);if(u.avatar_id)get(`avatars/${u.avatar_id}.webp`).currentUsers.push(u.id);}
  for(const a of d.attempts){only(a,['id','user_id','state','created_at','check_after']);demand(record(a)&&uuid.test(a.id)&&uuid.test(a.user_id)&&['writing','live','retired'].includes(a.state)&&timestamp(a.created_at)&&(a.check_after===null||timestamp(a.check_after))&&!attempts.has(a.id));attempts.add(a.id);get(`avatars/${a.id}.webp`).attempts.push(a);}
  for(const obj of o.objects){only(obj,['key','size','lastModified','etag']);demand(record(obj)&&typeof obj.key==='string'&&obj.key.startsWith('avatars/')&&Number.isSafeInteger(obj.size)&&obj.size>=0&&(obj.lastModified===null||timestamp(obj.lastModified))&&(obj.etag===null||typeof obj.etag==='string')&&!keys.has(obj.key));keys.add(obj.key);get(obj.key).object=obj;}
  for(const row of rows.values()){
    row.classification=row.currentUsers.length?(row.object?'current-listed':o.complete?'current-not-listed':'current-unverified'):row.attempts.length?(d.terminal.users?'tracked-noncurrent-':'tracked-current-unverified-')+row.attempts[0].state:d.complete?'object-untracked-at-db-sample':'object-db-unverified';
    row.listObservation=row.object?'listed':o.complete?'not-listed':'unverified';
  }
  const result=[...rows.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  return {format:'epp-avatar-comparison/v1',createdAt:now(),database:d,objectListing:o,counts:{users:d.users.length,attempts:d.attempts.length,objects:o.objects.length,rows:result.length},rows:result,limitations:['数据库仅在一个只读快照内一致；对象多页清点不是快照，也不与数据库构成共同快照。','未列出不等于 HEAD 404；403、网络失败和不完整清点均不能证明不存在。','未被数据库样本追踪的对象可能在样本之后发布；按同一用户与键重新观察。','ETag 仅为服务端标识，不作为内容校验和。本报告不作删除授权。']};
}
export function html(m){const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>头像只读对照</title><style>body{font:16px sans-serif;margin:2em}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:.5em;overflow-wrap:anywhere}pre{white-space:pre-wrap}</style><h1>头像只读对照</h1><p>私有观察资料；不构成删除依据。</p><pre>'+escape(JSON.stringify({database:{source:m.database.source,startedAt:m.database.startedAt,endedAt:m.database.endedAt,complete:m.database.complete},objects:{source:m.objectListing.source,startedAt:m.objectListing.startedAt,endedAt:m.objectListing.endedAt,complete:m.objectListing.complete},counts:m.counts,limitations:m.limitations},null,2))+'</pre><table><tr><th>精确键</th><th>分类</th><th>当前用户</th><th>尝试 / 对象观察</th></tr>'+m.rows.map(r=>'<tr>'+[r.key,r.classification,r.currentUsers.join(', '),JSON.stringify({attempts:r.attempts,object:r.object,listObservation:r.listObservation})].map(x=>'<td>'+escape(x)+'</td>').join('')+'</tr>').join('')+'</table></html>';}
