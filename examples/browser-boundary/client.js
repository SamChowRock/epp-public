const output = document.querySelector('#output');
document.querySelector('#origin').textContent = '当前页面：' + location.origin + '；API 入口：http://127.0.0.1:3350';
let csrf;
function show(value) { output.textContent += value + '\n'; }
async function call(path, { method = 'GET', body, token = true } = {}) {
  const response = await fetch('http://127.0.0.1:3350' + path, {
    method, credentials: 'include',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-EPP-Request': '1',
      ...(token && csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text(), data = text ? JSON.parse(text) : {};
  if (path === '/auth/csrf' && response.ok) csrf = data.csrfToken;
  if (path === '/auth/login' && response.ok || path === '/auth/logout' && response.ok) csrf = undefined;
  show(method + ' ' + path + ' → ' + response.status + (data.code ? ' ' + data.code : '')
    + (path === '/auth/csrf' && response.ok ? ' Token 已留在页面内存' : ''));
}
function bind(id, run) { document.querySelector('#' + id).addEventListener('click', () => void run().catch(() => show(id + ' → 浏览器未提供可读取的响应；请核对 Network 和 API 日志'))); }
document.querySelector('#login').addEventListener('submit', event => {
  event.preventDefault();
  const password = document.querySelector('#password');
  const body = { userId: document.querySelector('#user').value, password: password.value, label: 'Browser boundary lab' };
  password.value = '';
  void call('/auth/login', { method: 'POST', body, token: false }).catch(() => show('登录响应不可读；检查 Network'));
});
bind('csrf', () => call('/auth/csrf')); bind('me', () => call('/auth/me'));
bind('missing', () => call('/captures', { method: 'POST', body: { originalText: 'Browser boundary example.' }, token: false }));
bind('save', () => call('/captures', { method: 'POST', body: { originalText: 'Browser boundary example.' } }));
bind('logout', () => call('/auth/logout', { method: 'POST', body: {} }));
bind('preflight', () => call('/captures', { method: 'POST', body: { originalText: 'Cross-origin attempt.' } }));
bind('crossread', () => call('/auth/me'));
bind('simple', async () => {
  const response = await fetch('http://127.0.0.1:3350/auth/logout', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'text/plain' }, body: '{}',
  });
  show('简单 POST → ' + response.status);
});
