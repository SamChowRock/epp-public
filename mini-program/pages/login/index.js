// Use the configured HTTPS request domain on a device. Localhost is simulator-only.
const baseUrl = 'http://127.0.0.1:3000';
let token;
function request(path, method, data, authenticated = false) {
  return new Promise((resolve, reject) => wx.request({
    url: baseUrl + path, method, data, timeout: 8000,
    header: { 'content-type': 'application/json', 'X-EPP-Request': '1',
      ...(authenticated && token ? { Authorization: 'Bearer ' + token } : {}) },
    success(res) {
      if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
      else {
        if (res.statusCode === 401) token = undefined;
        reject(new Error(res.data?.code || 'HTTP_' + res.statusCode));
      }
    },
    fail() { reject(new Error('NETWORK_RESULT_UNKNOWN')); },
  }));
}
function freshCode() {
  return new Promise((resolve, reject) => wx.login({ timeout: 5000,
    success(res) { res.code ? resolve(res.code) : reject(new Error('PLATFORM_CODE_MISSING')); },
    fail() { reject(new Error('PLATFORM_LOGIN_FAILED')); },
  }));
}
Page({
  data: { busy: false, userId: '', password: '', message: '令牌仅在当前进程内存中保留。' },
  onUserId(e) { this.setData({ userId: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  async run(action) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try { await action(); }
    catch (e) { this.setData({ message: e.message }); }
    finally { this.setData({ busy: false, password: '' }); }
  },
  signIn(link) {
    return this.run(async () => {
      if (token) throw new Error('请先退出当前会话');
      const code = await freshCode();
      const result = await request('/auth/mini/' + (link ? 'link' : 'login'), 'POST', {
        code, label: 'Mini program', ...(link ? { userId: this.data.userId, password: this.data.password } : {}),
      });
      if (result.miniEnabled === false) {
        this.setData({ message: '身份已确认，待开通小程序入口。账号：' + result.userId });
        return;
      }
      token = result.token;
      this.setData({ message: '已登录：' + result.userId });
    });
  },
  login() { return this.signIn(false); },
  link() { return this.signIn(true); },
  read() { return this.run(async () => {
    if (!token) throw new Error('请先登录');
    const result = await request('/captures?limit=5', 'GET', undefined, true);
    this.setData({ message: '当前列表返回 ' + result.items.length + ' 条素材；不代表总数。' });
  }); },
  logout() { return this.run(async () => {
    if (token) await request('/auth/logout', 'POST', {}, true);
    token = undefined;
    this.setData({ message: '已退出。' });
  }); },
});
