import test from 'node:test';
import assert from 'node:assert/strict';
import { startLab } from '../examples/oidc-lab.mjs';
import { parseConfig } from '../dist/src/config.js';
import { hashPassword } from '../dist/src/password.js';

test('OIDC: a loopback HTTP issuer is forbidden outside test mode',()=>{
  const env={APP_ORIGIN:'https://epp.example',OIDC_ISSUER:'http://localhost:8020',OIDC_CLIENT_ID:'example',OIDC_CLIENT_SECRET:'fictional'};
  for(const mode of ['development','production'])assert.throws(()=>parseConfig({port:3000},{...env,NODE_ENV:mode,CURSOR_HMAC_KEY:'0'.repeat(64)}));
  assert.throws(()=>parseConfig({port:3000},{...env,NODE_ENV:'test',OIDC_ISSUER:'http://not-local.example'}));
});
function flow(lab){
  const {origin,ids,provider}=lab;
  return async function begin(mode='login',id=ids[0],choice='allow'){
    const r=await lab.post('/auth/oidc/start',mode==='link'?{mode,userId:id,password:lab.password}:{mode});
    assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
    const page=await fetch((await r.json()).authorizationUrl);
    const ticket=/name="ticket" value="([^"]+)"/.exec(await page.text())[1];
    const approve=await fetch(provider.issuer+'/approve',{method:'POST',body:new URLSearchParams({ticket,choice}),redirect:'manual'});
    const url=approve.headers.get('location');return {url,cookie,finish:(c=cookie)=>fetch(url,{headers:{Cookie:c},redirect:'manual'})};
  };
}

test('OIDC browser transaction, verified claims, account binding and local authorization',async()=>{
  const lab=await startLab(3381), {origin,ids,provider,db,prefix}=lab;
  const begin=flow(lab);
  try{
    const a=await begin('link');assert.equal((await a.finish('')).status,400);
    const responses=await Promise.all([a.finish(),a.finish()]);assert.deepEqual(responses.map(r=>r.status).sort(),[303,400]);
    const session=responses.find(r=>r.status===303).headers.getSetCookie().find(x=>x.startsWith('epp_session=')).split(';')[0];
    const read=await fetch(origin+'/captures/'+lab.capture.id,{headers:{Cookie:session}});assert.equal(read.status,200);assert.deepEqual(await read.json(),lab.capture);
    const conflict=await begin('link',ids[1]);assert.equal((await conflict.finish()).status,409);
    for(const fault of ['signature','nonce','aud','iss','exp']){
      provider.fault=fault;assert.equal((await (await begin()).finish()).status,401,fault);
    }
    provider.fault='';assert.equal(await db.session.count({where:{userId:ids[0]}}),1);
    provider.subject=prefix+'-new';
    const pending=await (await begin()).finish();assert.equal(pending.status,303);assert.match(pending.headers.get('location'),/#pending=/);
    assert.ok(!pending.headers.getSetCookie().some(x=>x.startsWith('epp_session=')));
    const account=await db.oidcIdentity.findUniqueOrThrow({where:{issuer_subject:{issuer:provider.issuer,subject:provider.subject}}});
    assert.equal(await db.session.count({where:{userId:account.userId}}),0);
    provider.subject=prefix;const stale=await begin('link');
    await db.passwordCredential.update({where:{userId:ids[0]},data:{passwordHash:await hashPassword('Changed fictional password')}});
    assert.equal((await stale.finish()).status,401);
  }finally{await lab.close();}
});

test('OIDC: independent first logins converge, cancellation and wrong PKCE give no session, subsequent web eligibility still applies',async()=>{
  const lab=await startLab(3381),begin=flow(lab), {provider,db,origin}=lab;
  try {
    const cancelled=await begin('login',undefined,'deny');assert.equal((await cancelled.finish()).status,403);
    for(const [fault,status] of [['busy',503],['extra-audience',401]]){
      provider.fault=fault;assert.equal((await (await begin()).finish()).status,status);
    }
    provider.fault='';const bad=await begin();const code=new URL(bad.url).searchParams.get('code');
    // The same client owns this lab, but the wrong verifier must still fail at its token endpoint.
    const denied=await provider.tryWrongVerifier(code);assert.equal(denied.status,400);
    assert.equal((await bad.finish()).status,401);
    const [a,b]=await Promise.all([begin(),begin()]);const [x,y]=await Promise.all([a.finish(),b.finish()]);
    assert.equal(x.status,303);assert.equal(y.headers.get('location'),x.headers.get('location'));
    const userId=x.headers.get('location').split('#pending=')[1];assert.ok(userId);
    assert.equal(await db.oidcIdentity.count({where:{issuer:provider.issuer,subject:provider.subject}}),1);
    await db.user.update({where:{id:userId},data:{webEnabled:true}});
    const r=await (await begin()).finish();assert.equal(r.status,303);
    const cookie=r.headers.getSetCookie().find(x=>x.startsWith('epp_session=')).split(';')[0];
    const get=(path)=>fetch(origin+path,{headers:{cookie}});
    assert.equal((await (await get('/auth/me')).json()).userId,userId);
    assert.equal((await get('/captures/'+lab.capture.id)).status,404);
    await db.user.update({where:{id:userId},data:{webEnabled:false}});
    assert.equal((await get('/auth/me')).status,403);
  }finally{await lab.close();}
});
