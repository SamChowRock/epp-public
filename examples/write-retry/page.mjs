import { PendingWrite, sendPendingWrite, writeHeaders } from './pending.mjs';
const $ = id => document.getElementById(id);
const config = await fetch('/practice-config', { cache: 'no-store' }).then(r => r.json());
$('mode').textContent = config.dropSuccessOnce
  ? '丢响应练习已开启：每个操作键的第一次成功响应都会被丢弃。'
  : '保存原操作键和参数，在结果未知时继续同一次提交。';
async function jsonRequest(path, options = {}) {
  const { expectedStatus, ...fetchOptions } = options;
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...fetchOptions });
  if (!response.ok) { const error = Error(`HTTP ${response.status}`); error.status = response.status; throw error; }
  if (expectedStatus !== undefined && response.status !== expectedStatus) throw Error('Unexpected success status');
  return response.status === 204 ? null : response.json();
}
const labels = { checking: '正在确认当前身份…', ready: '可以提交', pending: '发现上次待提交记录，可继续原操作。',
  sending: '正在提交，请保留此页…', uncertain: '未取得可确认的成功结果。请保留待办，继续上次提交。',
  success: '提交成功，待办已清除。', 'signed-out': '当前未登录，已清除本页内容。',
  'identity-changed': '身份已变化，已清除上次输入与待办。',
  'storage-error': '本页无法可靠保存或清除待办，请检查浏览器存储设置。未自动发起新请求。',
  unavailable: '无法确认当前身份或读取待办，请恢复连接后刷新。' };
let visibleOwner = null;
const model = new PendingWrite({
  // Access sessionStorage lazily: a browser denying access can throw even at property access.
  storage: { getItem: k => sessionStorage.getItem(k), setItem: (k,v) => sessionStorage.setItem(k,v), removeItem: k => sessionStorage.removeItem(k) },
  identify: async () => {
    try {
      const identity = await jsonRequest(config.sessionMode ? '/auth/me' : '/lab/identity');
      if (config.sessionMode && (typeof identity.sessionId !== 'string' || !identity.sessionId)) throw Error('Missing session identity');
      return identity;
    }
    catch (error) { if (error.status === 401) return null; throw error; }
  },
  uuid: () => crypto.randomUUID(),
  send: (record, context) => sendPendingWrite(record, { ...context, ...config, request: jsonRequest }),
  changed: state => {
    if (state.owner !== visibleOwner) { $('form').reset(); visibleOwner = state.owner; $('target-row').hidden = true; }
    const busy = ['sending', 'checking'].includes(state.phase);
    $('editor').disabled = !state.owner || !!state.pending || busy || state.phase === 'unavailable';
    $('retry').disabled = !state.pending || busy;
    $('clear').disabled = !state.pending;
    $('status').textContent = labels[state.phase];
    $('pending').hidden = !state.pending;
    $('pending').textContent = state.pending ? `操作键：${state.pending.operationId}\n路径：${state.pending.path}\n原参数：${state.pending.body}` : '';
    $('result').hidden = !state.result;
    $('result').textContent = state.result ? JSON.stringify(state.result, null, 2) : '';
  },
});
$('action').onchange = () => { $('target-row').hidden = $('action').value !== 'revision'; };
$('form').onsubmit = async event => {
  event.preventDefault();
  const path = $('action').value === 'create' ? '/captures' : `/captures/${$('target').value.trim()}/revisions`;
  try { await model.submit(path, { originalText: $('original').value, chineseIntent: $('intent').value || null }); }
  catch { $('status').textContent = '请检查素材 ID 和输入内容。'; }
};
$('retry').onclick = () => model.retry();
$('clear').onclick = () => { model.clearPending(); $('form').reset(); $('target-row').hidden = true; };
$('logout').hidden = !config.sessionMode;
let logoutOwner = null;
$('logout').onclick = async () => {
  // Keep only the expected identity for retrying a failed logout, never credentials.
  logoutOwner = model.state.owner ?? logoutOwner;
  const owner = logoutOwner;
  model.clearIdentity();
  try { await jsonRequest('/auth/logout', { method: 'POST',
    headers: await writeHeaders(owner, { ...config, request: jsonRequest }), body: '{}' });
    logoutOwner = null;
  }
  catch { $('status').textContent = '本页内容已清除，但服务端退出尚未确认。请恢复连接后再次退出。'; }
};
await model.initialize();
