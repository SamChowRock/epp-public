export const scanPage = (nonce: string) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>EPP · 扫码登录</title>
<style nonce="${nonce}">main{max-width:36rem;margin:8vh auto;padding:1rem;font:17px/1.65 system-ui;color:#173439}button{font:inherit;margin-right:.6rem} output{display:block;margin:1rem 0}img{display:block}img[hidden]{display:none}</style>
<main><h1>用小程序登录这台电脑</h1><p>在已登录的 EPP 小程序内打开“扫码登录网站”，核对网站和识别码后确认。</p>
<button id="start">生成登录码</button><button id="cancel" hidden>取消本次登录</button>
<img id="qr" hidden alt="用 EPP 小程序扫描的登录码"><output id="status" aria-live="polite">尚未发起登录。</output></main>
<script nonce="${nonce}">
const el=id=>document.getElementById(id);
let scene, timer;
async function post(action,body){
 const r=await fetch('/auth/scan/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-EPP-Request':'1'},body:JSON.stringify(body)});
 const result=await r.json();if(!r.ok)throw Error(result.code||String(r.status));return result;
}
function end(message){clearTimeout(timer);scene=undefined;el('qr').hidden=true;el('qr').removeAttribute('src');el('cancel').hidden=true;el('start').disabled=false;el('status').textContent=message;}
async function poll(expected){
 if(scene!==expected)return;
 try{
  const result=await post('status',{scene:expected});
  if(scene!==expected)return;
  if(result.status==='pending'){timer=setTimeout(()=>poll(expected),2000);return;}
  if(result.status!=='confirmed'){end('本次登录已结束：'+result.status);return;}
  el('cancel').disabled=true;
  const issued=await post('consume',{scene:expected});
  const me=await fetch('/auth/me').then(r=>r.json());
  if(me.userId!==issued.userId)throw Error('请检查当前会话');
  end('已登录。网站当前用户 ID：'+me.userId);
 }catch(e){if(scene===expected)end('请检查当前会话或重新发起：'+e.message);}
}
el('start').onclick=async()=>{
 el('start').disabled=true;
 try{const t=await post('start',{});scene=t.scene;el('qr').src=t.image;el('qr').hidden=false;
 el('cancel').disabled=false;el('cancel').hidden=false;el('status').textContent='等待手机确认 · 识别码 '+scene.slice(-6);
 timer=setTimeout(()=>poll(t.scene),2000);}catch(e){end('无法开始：'+e.message);}
};
el('cancel').onclick=async()=>{const expected=scene;scene=undefined;clearTimeout(timer);el('cancel').disabled=true;
 try{await post('cancel',{scene:expected});end('本次登录已取消。');}catch(e){end('取消结果待核对：'+e.message);}};
</script></html>`;
