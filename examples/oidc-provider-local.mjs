// Fictional issuer for the loopback exercise only. The production API never imports this file.
import { createServer } from 'node:http';
import { randomBytes, generateKeyPairSync, createHash, sign } from 'node:crypto';
export async function localProvider({ port=0, callback, clientId, secret }) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',use:'sig',kid:'lab-38'};
  const pending=new Map(), codes=new Map(), key=()=>randomBytes(24).toString('base64url');
  const lab={ subject:'fictional-reader', fault:'', exchanges:0 };
  const bytes=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  let issuer;
  const server=createServer(async (req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    const json=(status,x)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(x));};
    try {
      const u=new URL(req.url,issuer), p=u.searchParams;
      for(const m of [pending,codes])for(const [k,a] of m)if(a.until<=Date.now())m.delete(k);
      if(u.pathname==='/.well-known/openid-configuration')return json(200,{issuer,authorization_endpoint:issuer+'/authorize',
        token_endpoint:issuer+'/token',jwks_uri:issuer+'/keys',response_types_supported:['code'],subject_types_supported:['public'],
        id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['client_secret_basic']});
      if(u.pathname==='/keys')return json(200,{keys:[jwk]});
      if(u.pathname==='/authorize' && req.method==='GET'){
        if(p.get('client_id')!==clientId||p.get('redirect_uri')!==callback||p.get('response_type')!=='code'||p.get('scope')!=='openid'
          ||p.get('code_challenge_method')!=='S256'||!p.get('nonce')||!p.get('state')||!p.get('code_challenge'))return json(400,{error:'invalid_request'});
        if(pending.size+codes.size>=128)return json(429,{error:'busy'});
        const ticket=key();pending.set(ticket,{state:p.get('state'),nonce:p.get('nonce'),challenge:p.get('code_challenge'),until:Date.now()+300000});
        res.setHeader('Referrer-Policy','same-origin');
        res.setHeader('Content-Security-Policy',`default-src 'none'; form-action 'self' ${new URL(callback).origin}; frame-ancestors 'none'`);
        res.setHeader('Content-Type','text/html; charset=utf-8');
        return res.end(`<!doctype html><html lang="zh-CN"><meta charset=utf-8><title>本地身份提供方</title><main><h1>本地身份提供方</h1><p>当前是虚构读者。允许 EPP 确认这个身份？本次不授予读取其他资源的权限。</p><form action="/approve" method="post"><input type="hidden" name="ticket" value="${ticket}"><button name="choice" value="allow">以实验身份 A 继续</button> <button name="choice" value="allow-b">以实验身份 B 继续</button> <button name="choice" value="deny">取消</button></form></main></html>`);
      }
      if(req.method!=='POST')return json(404,{error:'not_found'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)return json(413,{error:'too_large'});}
      const form=new URLSearchParams(body);
      if(u.pathname==='/approve'){
        if(req.headers.origin && req.headers.origin!==issuer)return json(403,{error:'origin'});
        const ticket=form.get('ticket'), a=pending.get(ticket);if(!a)return json(400,{error:'invalid_request'});pending.delete(ticket);
        const dest=new URL(callback);dest.searchParams.set('state',a.state);
        const choice=form.get('choice');
        if(choice==='allow'||choice==='allow-b'){
          const code=key();
          codes.set(code,{...a,subject:choice==='allow' ? lab.subject : lab.subject+'-b'});dest.searchParams.set('code',code);}
        else dest.searchParams.set('error','access_denied');
        res.writeHead(303,{Location:dest.href});return res.end();
      }
      if(u.pathname!=='/token')return json(404,{error:'not_found'});
      const basic=/^Basic ([A-Za-z0-9+/=]+)$/.exec(req.headers.authorization??'');
      const pair=basic?Buffer.from(basic[1],'base64').toString().split(':').map(x=>decodeURIComponent(x.replaceAll('+',' '))):[];
      if(pair.length!==2||pair[0]!==clientId||pair[1]!==secret)return json(401,{error:'invalid_client'});
      const code=form.get('code'), a=codes.get(code);codes.delete(code);
      const challenge=createHash('sha256').update(form.get('code_verifier')??'').digest('base64url');
      if(!a||a.challenge!==challenge||form.get('redirect_uri')!==callback||form.get('grant_type')!=='authorization_code')return json(400,{error:'invalid_grant'});
      lab.exchanges++;
      if(lab.fault==='busy')return json(503,{error:'temporarily_unavailable'});
      const now=Math.floor(Date.now()/1000), c={iss:issuer,sub:a.subject,aud:clientId,iat:now,exp:now+300,nonce:a.nonce};
      if(lab.fault==='nonce')c.nonce='not-this-attempt';
      if(lab.fault==='aud')c.aud='another-client';
      if(lab.fault==='extra-audience'){c.aud=[clientId,'another-client'];c.azp=clientId;}
      if(lab.fault==='iss')c.iss='https://other.example';
      if(lab.fault==='exp')c.exp=now-300;
      const h=bytes({alg:'RS256',kid:jwk.kid})+'.'+bytes(c);
      const sig=sign('RSA-SHA256',Buffer.from(h),privateKey);if(lab.fault==='signature')sig[0]^=1;
      return json(200,{access_token:key(),token_type:'Bearer',expires_in:300,id_token:h+'.'+sig.toString('base64url')});
    }catch{return json(400,{error:'invalid_request'});}
  });
  await new Promise((ok,fail)=>server.once('error',fail).listen(port,'127.0.0.1',ok));
  issuer='http://localhost:'+server.address().port;
  return Object.assign(lab,{issuer,tryWrongVerifier:(code)=>fetch(issuer+'/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(clientId+':'+secret).toString('base64')},
    body:new URLSearchParams({code,grant_type:'authorization_code',redirect_uri:callback,code_verifier:'z'.repeat(43)})}),close:()=>new Promise((ok,fail)=>server.close(e=>e?fail(e):ok()))});
}
