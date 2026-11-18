import {Pager,sameIds,validItem,readForOwner} from './pager.mjs';
const $=id=>document.getElementById(id);
const config=await fetch('/practice-config',{cache:'no-store'}).then(r=>r.json());
const model=new Pager(); let owner=null,identity=null,visible=false,legacy=null,legacyTicket=null,viewEpoch=0,verifying=null,authenticating=false;
const modes=[];
if(config.legacyCap)modes.push('隔离模拟：旧列表只保留前 100 条（正式 API 未修改）');
if(config.faultNextPageOnce)modes.push('隔离模拟：本次代理启动后第一次成功续页读取被替换为 503');
$('simulation').textContent=modes.length?modes.join('；'):'正常代理：未开启旧列表截断或续页故障。';
$('login-region').hidden=!config.sessionMode;
async function request(path,options={}) {
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
 if(!response.ok){const e=Error(`HTTP ${response.status}`);e.status=response.status;throw e;}
 return response.status===204?null:response.json();
}
function render(){
 $('work').hidden=!visible||!owner;
 $('legacy').disabled=!!legacyTicket; $('next').disabled=!!model.active||model.done||model.requiresRestart||!owner;
 $('next').textContent=model.requiresRestart?'请从第一页重新开始':model.error?'重试同一页':model.done?'已到末页':model.pages.length?'读取下一页':'读取第一页';
 $('legacy-count').textContent=legacy===null?'尚未读取':`旧列表返回 ${legacy.length} 条${config.legacyCap?'（隔离截断模拟）':''}`;
 $('legacy-ids').textContent=legacy?.map(i=>i.id).join('\n')??'';
 $('progress').textContent=`已接受 ${model.pages.length} 页，累计 ${model.items.length} 条${model.complete?'':'；存在不可用素材，当前清单不完整'}`;
 $('cursor-state').textContent=model.done?'nextCursor = null；可读取条目已到末页。':model.cursor?'下一次请求保留已接受响应给出的游标。':'下一次请求不带游标。';
 $('pages').replaceChildren(...model.pages.map((page,i)=>{const d=document.createElement('details');const s=document.createElement('summary');s.textContent=`第 ${i+1} 页：接受 ${page.count} 条`;const p=document.createElement('pre');p.textContent=page.ids.join('\n');d.append(s,p);return d;}));
 $('accepted-ids').textContent=model.items.map(i=>i.id).join('\n');
 $('comparison').textContent=legacy===null||!model.done?'两套读取都完成后比较。':sameIds(legacy,model.items)?`有序 ID 逐项相同，共 ${legacy.length} 条。`:`有序 ID 不相同：旧 ${legacy.length} 条，新 ${model.items.length} 条。请核对模拟开关和读取期间的数据变化。`;
}
function clearResults(nextOwner=owner,q=$('filter').value){legacy=null;legacyTicket=null;model.reset(nextOwner,q);render();}
function conceal(){viewEpoch++;visible=false;legacyTicket=null;if(model.active)model.fail(model.active);$('work').hidden=true;}
function forget(){conceal();owner=null;identity=null;$('filter').value='';clearResults(null,'');$('identity').textContent='当前身份未确认。';}
async function verify(){
 if(authenticating||document.hidden)return false;
 const epoch=viewEpoch;
 if(verifying?.epoch===epoch)return verifying.promise;
 const pending={epoch,promise:null};verifying=pending;
 pending.promise=(async()=>{try{
  const result=await request(config.sessionMode?'/auth/me':'/practice/identity');
  if(typeof result.userId!=='string'||(config.sessionMode&&(typeof result.sessionId!=='string'||!result.sessionId)))throw Error('Invalid identity');
  if(epoch!==viewEpoch)return false;
  const nextOwner=JSON.stringify([result.userId,config.sessionMode?result.sessionId:null]);
  if(nextOwner!==owner){$('filter').value='';owner=nextOwner;clearResults(owner,'');}
  identity=result;visible=true;
  $('identity').textContent=config.sessionMode?`真实登录用户：${result.userId}`:`固定身份阶段：${result.userId}（此声明只用于本页清理结果；API 自行限定用户）`;
  $('status').textContent='身份已确认，可以读取。';render();return true;
 }catch(e){if(epoch===viewEpoch){forget();$('status').textContent=e.status===401?'尚未登录，旧结果已清空。':'无法确认身份，结果保持隐藏。';}return false;}
 })();try{return await pending.promise;}finally{if(verifying===pending)verifying=null;}
}
async function checkedRead(){const epoch=viewEpoch;const ok=await verify();return ok&&epoch===viewEpoch&&visible;}
$('filter').oninput=()=>{clearResults();$('status').textContent='筛选已变化，两套结果已清空。';};
$('restart').onclick=()=>{clearResults();$('status').textContent='已清空两套结果，可重新读取。';};
$('legacy').onclick=async()=>{
 if(legacyTicket||!await checkedRead())return;
 if(legacyTicket)return;
 const ticket={epoch:model.epoch,view:viewEpoch};legacyTicket=ticket;render();
 try{const params=new URLSearchParams();if(model.q!=='')params.set('q',model.q);await readForOwner({owner,sessionId:config.sessionMode?identity?.sessionId:null,path:'/captures'+(params.size?'?'+params:''),request,identify:async()=>await verify()?owner:null,isCurrent:()=>legacyTicket===ticket&&ticket.epoch===model.epoch&&ticket.view===viewEpoch,clearIdentity:forget,accept:({items:result})=>{
  if(!Array.isArray(result)||!result.every(validItem)||new Set(result.map(i=>i.id)).size!==result.length)throw Error('Invalid old list');
  legacy=result;$('status').textContent='旧列表读取成功。';}});
 }catch(e){if(legacyTicket===ticket){if(e.status===401||e.status===403)forget();$('status').textContent=`旧列表未接受：${e.message}`;}}
 finally{if(legacyTicket===ticket)legacyTicket=null;render();}
};
$('next').onclick=async()=>{
 if(model.active||!await checkedRead())return;
 const ticket=model.begin();if(!ticket)return;render();
 const params=new URLSearchParams({limit:String(model.limit)});if(model.q!=='')params.set('q',model.q);if(ticket.cursor!==null)params.set('cursor',ticket.cursor);
 try{await readForOwner({owner,sessionId:config.sessionMode?identity?.sessionId:null,path:'/captures/page?'+params,request,identify:async()=>await verify()?owner:null,isCurrent:()=>model.current(ticket),clearIdentity:forget,accept:result=>{if(model.accept(ticket,result))$('status').textContent=!model.complete?'当前账号有不可用素材；这里只展示可读取的部分，不能当作完整清单。':'本页通过校验，现已推进游标。';}});}
 catch(e){if(model.current(ticket)){if(e.status===400){model.invalidate(ticket);legacy=null;legacyTicket=null;$('status').textContent='请求或游标失效（400），两套结果已清空。请点击“从第一页重新开始”。';}else if(e.status===401||e.status===403){forget();$('status').textContent='会话或权限校验失败，旧结果已清空，请重新确认身份。';}else{model.fail(ticket);$('status').textContent=`本页未接受：${e.message}。累计结果与请求游标保留，可重试同一页。`;}}}
 render();
};
$('login-form').onsubmit=async e=>{
 e.preventDefault();if(authenticating)return;
 const userId=$('login-user').value.trim(),password=$('login-password').value;$('login-password').value='';
 authenticating=true;logoutIdentity=null;forget();$('login-fields').disabled=true;$('logout').disabled=true;
 try{await request('/auth/login',{method:'POST',headers:{'Content-Type':'application/json',...(config.csrfMode?{'X-EPP-Request':'1'}:{})},body:JSON.stringify({userId,password,label:'Capture paging practice'})});$('status').textContent='登录成功，正在确认身份。';}
 catch(e){$('status').textContent=`登录未完成：${e.message}`;}
 finally{authenticating=false;$('login-fields').disabled=false;$('logout').disabled=false;await verify();}
};
let logoutIdentity=null;
$('logout').onclick=async()=>{
 if(authenticating)return;
 logoutIdentity=identity??logoutIdentity;const expected=logoutIdentity;authenticating=true;forget();
 try{if(!expected?.sessionId)throw Error('请先确认会话');const headers={'Content-Type':'application/json','X-Expected-Session':expected.sessionId};
  if(config.csrfMode){headers['X-EPP-Request']='1';const {csrfToken}=await request('/auth/csrf');if(typeof csrfToken!=='string'||!csrfToken)throw Error('Invalid CSRF');headers['X-CSRF-Token']=csrfToken;}
  await request('/auth/logout',{method:'POST',headers,body:'{}'});logoutIdentity=null;$('status').textContent='已退出，旧结果已清空。';
 }catch(e){$('status').textContent=`本页已清空，服务端退出未确认：${e.message}。可再次退出。`;}
 finally{authenticating=false;}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){conceal();$('login-password').value='';}else void verify();});
window.addEventListener('blur',conceal);window.addEventListener('focus',()=>void verify());
await verify();
