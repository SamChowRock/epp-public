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
  scanWebsite() {
    return this.run(async () => {
      if (!token) throw new Error('请先登录小程序');
      const scanned = await new Promise((resolve, reject) => wx.scanCode({
        onlyFromCamera: true, scanType: ['qrCode'], success: resolve,
        fail: () => reject(new Error('已结束扫描，可以重新发起')),
      }));
      const match = /^epp:login:v1:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(scanned.result);
      if (!match) throw new Error('这不是 EPP 网站登录码');
      const scene = match[1];
      const view = await request('/auth/scan/inspect', 'POST', { scene }, true);
      if (view.status !== 'pending') throw new Error('此码已处理，请从电脑重新发起');
      const me = await request('/auth/me', 'GET', undefined, true);
      const answer = await new Promise((resolve, reject) => wx.showModal({
        title: '允许这台电脑登录？',
        content: '网站：' + view.origin + '，识别码：' + view.displayCode + '。将使用当前账号 ' + me.userId + '。只确认自己正在操作的电脑。',
        confirmText: '允许登录', success: resolve, fail: () => reject(new Error('确认框未完成')),
      }));
      if (!answer.confirm) { this.setData({ message: '未授权这台电脑。' }); return; }
      await request('/auth/scan/confirm', 'POST', { scene }, true);
      this.setData({ message: '已确认，请回到电脑查看登录结果。' });
    });
  },
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
