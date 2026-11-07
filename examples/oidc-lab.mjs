import '../test/database-env.mjs';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { localProvider } from './oidc-provider-local.mjs';
import { createApp } from '../dist/src/app.js';
import { parseConfig } from '../dist/src/config.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { hashPassword } from '../dist/src/password.js';
import { removeTestCaptures } from '../test/cleanup.mjs';

export async function startLab(port=3380) {
  const origin='http://127.0.0.1:'+port, clientId='chapter-38', secret=randomUUID();
  const provider=await localProvider({callback:origin+'/auth/oidc/callback',clientId,secret});
  const prefix='reader-'+randomUUID();provider.subject=prefix;
  const ids=[randomUUID(),randomUUID()], password='Fictional chapter 38 password';
  let app,db,capture;
  async function close(){
    try{if(db){
      const experiment={issuer:provider.issuer,subject:{startsWith:prefix}};
      const map=await db.oidcIdentity.findMany({where:experiment});
      // Only remove new passwordless accounts created by this lab's fictional issuer subjects.
      const created=await db.user.findMany({where:{id:{in:map.map(m=>m.userId)},passwordCredential:null},select:{id:true}});
      const owned=[...ids,...created.map(u=>u.id)];
      if(capture)await removeTestCaptures(db,[capture.id],new Set());
      await db.oidcIdentity.deleteMany({where:experiment});
      await db.session.deleteMany({where:{userId:{in:owned}}});
      await db.passwordCredential.deleteMany({where:{userId:{in:ids}}});
      await db.user.deleteMany({where:{id:{in:owned}}});
    }}finally{try{await app?.close();}finally{await provider.close();}}
  }
  try{
    const config=parseConfig({port},{NODE_ENV:'test',APP_ORIGIN:origin,LOG_LEVEL:'error',OIDC_ISSUER:provider.issuer,OIDC_CLIENT_ID:clientId,OIDC_CLIENT_SECRET:secret});
    app=await createApp(config);await app.listen(port,'127.0.0.1');db=app.get(DatabaseService).client;
    const passwordHash=await hashPassword(password);
    for(const id of ids)await db.user.create({data:{id,webEnabled:true,passwordCredential:{create:{passwordHash}}}});
    const post=(path,body,headers={})=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json','X-EPP-Request':'1',...headers},body:JSON.stringify(body)});
    const r=await post('/auth/login',{userId:ids[0],password});if(!r.ok)throw Error('Local fixture login failed');
    const cookie=r.headers.get('set-cookie').split(';')[0];
    const {csrfToken}=await fetch(origin+'/auth/csrf',{headers:{cookie}}).then(r=>r.json());
    const made=await post('/captures',{originalText:'This record predates external login.'},{Cookie:cookie,'X-CSRF-Token':csrfToken});
    if(made.status!==201)throw Error('Fixture capture failed');capture=await made.json();
    const out=await post('/auth/logout',{},{Cookie:cookie,'X-CSRF-Token':csrfToken});if(out.status!==204)throw Error('Fixture logout failed');
    return {origin,provider,prefix,ids,password,capture,db,post,close};
  }catch(e){await close();throw e;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const lab=await startLab();const tty=createInterface({input:process.stdin,output:process.stdout});
  try{console.log('Open '+lab.origin+'/auth/oidc. Choose LINK first. These are disposable lab credentials only.');
    console.log({userId:lab.ids[0],password:lab.password,captureId:lab.capture.id});
    await tty.question('Press Return after observations to remove the lab data.\n');
  }finally{tty.close();await lab.close();}
}
