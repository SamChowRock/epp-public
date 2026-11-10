const element = id => document.getElementById(id);
const login = element('login');
const panel = element('panel');
const items = element('items');
const log = element('log');
let source;
let active;
let rerun = false;
let sessionId;
const changes = new BroadcastChannel('epp-inbox-login');
changes.onmessage = () => showLogin('另一个实验页完成了登录，请重新登录。');

function record(text) {
  const entry = document.createElement('li');
  entry.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '  ' + text;
  log.append(entry);
  if (log.childElementCount > 6) log.firstElementChild.remove();
}
function disconnect() {
  source?.close();
  source = undefined;
  active?.abort();
  active = undefined;
  rerun = false;
  element('connection').textContent = '已断开 · 保留上次查询';
  element('toggle').textContent = '重新连接';
  element('refresh').disabled = true;
}
function showLogin(message) {
  disconnect();
  sessionId = undefined;
  panel.hidden = true;
  login.hidden = false;
  items.replaceChildren();
  log.replaceChildren();
  element('query').textContent = '';
  element('error').textContent = message;
}
async function matchesLogin(controller) {
  const response = await fetch('/auth/me', { signal: controller.signal, cache: 'no-store' });
  if (active !== controller) return false;
  if ([401, 403].includes(response.status)) { showLogin('会话不可用，请重新登录。'); return false; }
  if (!response.ok) throw Error('HTTP ' + response.status);
  const identity = await response.json();
  if (active !== controller) return false;
  if (identity.sessionId === sessionId) return true;
  showLogin('浏览器会话已改变，请重新登录。');
  return false;
}
async function firstPage() {
  if (active) { rerun = true; return; }
  const controller = new AbortController();
  active = controller;
  try {
    if (!await matchesLogin(controller)) return;
    const response = await fetch('/notifications?limit=20', { signal: controller.signal, cache: 'no-store' });
    if (active !== controller) return;
    if ([401, 403].includes(response.status)) { showLogin('会话不可用，请重新登录。'); return; }
    if (!response.ok) throw Error('HTTP ' + response.status);
    const page = await response.json();
    if (active !== controller || !await matchesLogin(controller)) return;
    items.replaceChildren(...page.items.map(item => {
      const row = document.createElement('li');
      const kind = item.kind === 'registered' ? '注册成功' : '密码重置成功';
      row.textContent = kind + ' · ' + (item.readAt ? '已读' : '未读') + ' · ' + item.createdAt;
      return row;
    }));
    element('query').textContent = '首页共 ' + page.items.length + ' 条' + (page.nextCursor ? '，另有下一页。' : '。');
    record('GET /notifications?limit=20 → 200 · ' + page.items.length + ' 条');
    element('error').textContent = '';
  } catch (err) {
    if (active === controller) element('error').textContent = '查询失败（' + err.message + '），可断开后重新连接。';
  } finally {
    if (active === controller) {
      active = undefined;
      if (rerun) { rerun = false; void firstPage(); }
    }
  }
}
function connect() {
  const stream = new EventSource('/notifications/events');
  source = stream;
  element('connection').textContent = '正在连接';
  element('toggle').textContent = '断开连接';
  element('refresh').disabled = false;
  stream.onopen = () => {
    if (stream !== source) return;
    element('connection').textContent = '已连接';
    record('open · 连接已建立，回查首页');
    void firstPage();
  };
  stream.addEventListener('inbox', () => {
    if (stream !== source) return;
    record('inbox · 收到提示，回查首页');
    void firstPage();
  });
  stream.onerror = () => {
    if (stream !== source) return;
    element('connection').textContent = stream.readyState === EventSource.CLOSED ? '连接已结束' : '等待浏览器重连';
    record('error · 查询当前会话的通知首页');
    void firstPage();
    if (stream.readyState === EventSource.CLOSED) {
      source = undefined;
      element('toggle').textContent = '重新连接';
    }
  };
}
element('refresh').onclick = () => { record('手动回查首页'); void firstPage(); };
element('toggle').onclick = () => {
  if (source) { disconnect(); record('close · 手动断开'); }
  else { disconnect(); connect(); }
};
element('switchAccount').onclick = () => showLogin('');
login.onsubmit = async event => {
  event.preventDefault();
  const button = login.querySelector('button');
  if (button.disabled) return;
  button.disabled = true;
  const body = JSON.stringify(Object.fromEntries(new FormData(login)));
  login.elements.password.value = '';
  try {
    const response = await fetch('/auth/login', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-EPP-Request': '1',
    }, body });
    if (!response.ok) throw Error('HTTP ' + response.status);
    sessionId = (await response.json()).sessionId;
    changes.postMessage('login');
    element('error').textContent = '';
    login.hidden = true;
    panel.hidden = false;
    connect();
  } catch (err) {
    showLogin('登录失败（' + err.message + '）。');
  } finally { button.disabled = false; }
};
window.addEventListener('pagehide', disconnect);
window.addEventListener('pageshow', event => { if (event.persisted) showLogin('请重新登录。'); });
