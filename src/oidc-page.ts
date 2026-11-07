export const oidcPage = (nonce: string) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>EPP · 外部账号登录</title>
<style nonce="${nonce}">body{max-width:38rem;margin:8vh auto;padding:1rem;font:17px/1.65 system-ui;color:#192d39}button,input{font:inherit;padding:.35rem .65rem}label{display:block;margin:.5rem 0}output{display:block;margin:1.25rem 0;padding:1rem;border-left:4px solid #25746d;background:#eff7f5;overflow-wrap:anywhere}details{margin-top:1.5rem}</style>
<main><small>EPP / 账号</small><h1>使用外部账号登录</h1><p>已经用密码在 EPP 保存过素材？首次接入请展开“关联已有账号”，以便继续使用原来的记录。</p>
<button id="login">用外部账号登录</button>
<details><summary>关联已有账号</summary><label>本地用户 ID <input id="uid" autocomplete="off"></label>
<label>当前 EPP 密码 <input id="pw" type="password" autocomplete="current-password"></label>
<button id="link">验证本地账号并前往身份提供方</button></details>
<output id="status" aria-live="polite">尚未开始本次登录。</output></main>
<script nonce="${nonce}">
const el = id => document.getElementById(id), status = el('status');
async function start(mode){
  el('login').disabled = el('link').disabled = true;
  try {
    const body = mode === 'login' ? {mode} : {mode,userId:el('uid').value,password:el('pw').value};
    el('pw').value='';
    const r = await fetch('/auth/oidc/start',{method:'POST',headers:{'Content-Type':'application/json','X-EPP-Request':'1'},body:JSON.stringify(body)});
    const data=await r.json(); if(!r.ok){status.textContent='未能开始登录：'+(data.code||r.status);return}
    location.assign(data.authorizationUrl);
  } catch {status.textContent='未收到登录地址，请重新发起。'} finally {el('login').disabled=el('link').disabled=false}
}
el('login').onclick=()=>start('login');el('link').onclick=()=>start('link');
if(location.hash==='#signed-in'){
  fetch('/auth/me').then(async r=>{status.textContent=r.ok?'已通过外部登录。当前 Web 会话的本地用户 ID：'+(await r.json()).userId:'未找到可用的 Web 会话，请重新登录。'}).catch(()=>status.textContent='无法核对当前会话。');
} else if(location.hash.startsWith('#pending=')){
  status.textContent='本次登录尚未取得 Web 资格。供管理员核对的本地用户 ID：'+location.hash.slice(9);
}
history.replaceState(null,'','/auth/oidc');
</script></html>`;
