'use strict';

const el = id => document.getElementById(id);
let csrf;
let events;
let generation = 0;
let inboxRequest = 0;

async function api(path, method = 'GET', body) {
  const headers = {};
  if (method !== 'GET') {
    headers['X-EPP-Request'] = '1';
    if (csrf) headers['X-CSRF-Token'] = csrf;
    if (!(body instanceof File)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
  }
  const response = await fetch(path, { method, headers, body, cache: 'no-store' });
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) throw new Error(method + ' ' + path + ' · ' + response.status + ' ' + data.code);
  return data;
}

function reset() {
  generation++;
  events?.close();
  events = null;
  csrf = undefined;
  el('actions').disabled = true;
  el('avatar').removeAttribute('src');
  el('avatar').hidden = true;
  el('capture').value = '';
  el('intent').value = '';
  el('file').value = '';
  el('items').replaceChildren();
  for (const id of ['session', 'material', 'photo', 'stream', 'inbox']) el(id).textContent = '';
}

function action(button, output, work) {
  el(button).onclick = async () => {
    const active = generation;
    el(button).disabled = true;
    try { await work(active); }
    catch (error) { if (active === generation) el(output).textContent = error.message; }
    finally { el(button).disabled = false; }
  };
}

function resetForm(id, output, submit) {
  const form = el(id);
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    el(output).textContent = '';
    try { el(output).textContent = await submit(); }
    catch (error) { el(output).textContent = error.message; }
    finally { button.disabled = false; }
  };
}

resetForm('request-reset', 'request-result', async () => {
  await api('/auth/reset/request', 'POST', { email: el('reset-email').value.trim() });
  return '202 · 请检查这个练习邮箱。若一分钟后还未收到邮件，可以再申请。';
});

resetForm('confirm-reset', 'confirm-result', async () => {
  const token = el('reset-token').value.trim();
  const newPassword = el('new-password').value;
  el('reset-token').value = '';
  el('new-password').value = '';
  await api('/auth/reset/confirm', 'POST', { token, newPassword });
  return '204 · 密码已重置。若当前登录的正是这个账号，点“刷新收件箱”核对旧会话的响应，再用新密码登录。';
});

el('login').onsubmit = async event => {
  event.preventDefault();
  reset();
  const button = event.submitter || el('login').querySelector('button');
  button.disabled = true;
  const password = el('password').value;
  el('password').value = '';
  try {
    const identity = await api('/auth/login', 'POST', { userId: el('user').value.trim(), password });
    csrf = (await api('/auth/csrf')).csrfToken;
    el('session').textContent = '已登录 ' + identity.userId;
    el('actions').disabled = false;
  } catch (error) { el('session').textContent = error.message; }
  finally { button.disabled = false; }
};

action('create', 'material', async active => {
  const marker = 'handoff-' + crypto.randomUUID();
  const chineseIntent = el('intent').value;
  if (!chineseIntent.trim()) throw new Error('请填写本次素材的中文意图。');
  const item = await api('/captures', 'POST', { originalText: marker, chineseIntent });
  if (active !== generation) return;
  el('capture').value = item.id;
  el('material').textContent = '已创建 ' + item.id + ' · ' + marker;
});

action('read', 'material', async active => {
  const id = el('capture').value.trim();
  if (!id) throw new Error('请先填写素材 ID。');
  const item = await api('/captures/' + encodeURIComponent(id));
  if (active === generation) el('material').textContent = '已读回 ' + item.id + ' · ' + item.originalText + ' · 中文意图：' + (item.chineseIntent ?? '尚未填写');
});

async function openAvatar(active, expected) {
  el('avatar').hidden = true;
  const { avatarId, url } = await api('/profile/avatar');
  if (active !== generation) return;
  if (expected && avatarId !== expected) throw new Error('当前头像 ID 与刚发布的 ID 不同。');
  const image = new Image();
  image.alt = '当前头像';
  image.id = 'avatar';
  image.src = url;
  try { await image.decode(); }
  catch { throw new Error('已取得签名地址，浏览器未能解码图片。请查看 Network 中的对象请求。'); }
  if (active !== generation) return;
  el('avatar').replaceWith(image);
  el('photo').textContent = avatarId + ' · 已解码 ' + image.naturalWidth + ' × ' + image.naturalHeight;
}

action('open', 'photo', active => openAvatar(active));
action('publish', 'photo', async active => {
  const file = el('file').files[0];
  if (!file) throw new Error('请选择 PNG 或 JPEG。');
  const result = await api('/profile/avatar', 'POST', file);
  if (active === generation) await openAvatar(active, result.avatarId);
});

async function refresh(active, source) {
  const request = ++inboxRequest;
  const { items } = await api('/notifications?limit=20');
  if (active !== generation || request !== inboxRequest) return;
  el('items').replaceChildren(...items.map(item => {
    const li = document.createElement('li');
    li.textContent = item.id + ' · ' + item.kind + ' · ' + item.createdAt;
    return li;
  }));
  el('inbox').textContent = source + ' · 最近 ' + items.length + ' 条';
}

action('refresh', 'inbox', active => refresh(active, '手动刷新'));
action('subscribe', 'stream', async active => {
  events?.close();
  const stream = new EventSource('/notifications/events');
  events = stream;
  el('stream').textContent = '正在连接';
  stream.addEventListener('inbox', async () => {
    if (stream !== events) return;
    el('stream').textContent = '收到 inbox 刷新提示';
    try { await refresh(active, '收到提示后查询'); }
    catch (error) { if (stream === events) el('inbox').textContent = error.message; }
  });
  stream.onerror = () => {
    if (stream !== events) return;
    stream.close();
    el('stream').textContent = '连接中断，请检查会话后重新订阅。';
  };
});

action('logout', 'session', async active => {
  await api('/auth/logout', 'POST', {});
  if (active === generation) { reset(); el('session').textContent = '已登出'; }
});
