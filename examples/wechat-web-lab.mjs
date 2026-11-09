import '../test/database-env.mjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { removeTestCaptures } from '../test/cleanup.mjs';
import { createApp } from '../dist/src/app.js';
import { parseConfig } from '../dist/src/config.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { hashPassword } from '../dist/src/password.js';
import { WechatWebFlow } from '../dist/src/wechat-web-flow.js';
import { WechatLogin } from '../dist/src/wechat-login.js';

// Only this loopback example substitutes the two platform endpoints.
export async function startWechatLab(port = 3390) {
  const origin = 'http://127.0.0.1:' + port;
  const callback = origin + '/auth/wechat-web/callback';
  const appId = 'wx' + randomBytes(8).toString('hex'), secret = randomBytes(16).toString('hex');
  const userId = randomUUID(), password = 'Fictional website password';
  const config = parseConfig({ port }, { NODE_ENV: 'test', APP_ORIGIN: origin,
    WECHAT_WEB_APP_ID: appId, WECHAT_WEB_APP_SECRET: secret, LOG_LEVEL: 'error' });
  const codes = new Map();
  const platform = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const state = url.searchParams.get('state');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (!/^[A-Za-z0-9_-]{43}$/.test(state ?? '')) { res.writeHead(400).end(); return; }
    if (url.pathname === '/confirm') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>网站授权实验</title><h1>本地模拟微信授权</h1><p>电脑浏览器正在等待本次授权。选择一个虚构身份完成回跳，关闭页面可观察没有回调的情形。</p><p><a href="/allow?who=A&amp;state='+state+'">使用实验身份 A</a></p><p><a href="/allow?who=B&amp;state='+state+'">使用实验身份 B</a></p></html>');
      return;
    }
    const who = url.searchParams.get('who');
    if (url.pathname !== '/allow' || !['A','B'].includes(who)) { res.writeHead(404).end(); return; }
    for (const [key, entry] of codes) if (entry.until <= Date.now()) codes.delete(key);
    if (codes.size >= 256) { res.writeHead(429).end(); return; }
    const code = randomUUID();
    codes.set(code, { who, until: Date.now() + 60000 });
    res.writeHead(303, { location: callback + '?' + new URLSearchParams({ code, state }) }).end();
  });
  let app, db, capture, createdFixture = false;
  async function close() {
    try {
      if (db) {
        if (capture) await removeTestCaptures(db, [capture.id], new Set());
        const mappings = await db.wechatIdentity.findMany({ where: { appId }, select: { userId: true } });
        const pending = await db.user.findMany({ where: { id: { in: mappings.map(row => row.userId) },
          passwordCredential: null, webEnabled: false }, select: { id: true } });
        const ids = [...pending.map(row => row.id), ...(createdFixture ? [userId] : [])];
        await db.$transaction([
          db.wechatIdentity.deleteMany({ where: { appId } }),
          db.session.deleteMany({ where: { userId: { in: ids } } }),
          db.passwordCredential.deleteMany({ where: { userId: { in: ids } } }),
          db.user.deleteMany({ where: { id: { in: ids } } }),
        ]);
      }
    } finally {
      try { await app?.close(); } finally {
        if (platform.listening) await new Promise(resolve => platform.close(resolve));
      }
    }
  }
  try {
    await new Promise((resolve, reject) => platform.once('error', reject).listen(0, '127.0.0.1', resolve));
    const authorize = 'http://localhost:' + platform.address().port + '/confirm';
    const exchange = new WechatLogin(config.wechatWeb, async input => {
      const url = new URL(input);
      if (url.origin !== 'https://api.weixin.qq.com' || url.pathname !== '/sns/oauth2/access_token'
        || url.searchParams.get('appid') !== appId || url.searchParams.get('secret') !== secret
        || url.searchParams.get('grant_type') !== 'authorization_code') throw Error('Unexpected exchange');
      const code = url.searchParams.get('code'), entry = codes.get(code);
      codes.delete(code);
      return Response.json(entry && entry.until > Date.now()
        ? { openid: 'fictional-' + entry.who, access_token: 'fictional', scope: 'snsapi_login' }
        : { errcode: 40029 });
    }, 'web');
    app = await createApp(config);
    const flow = new WechatWebFlow(config, exchange);
    // The real controller still claims state and calls the website response parser.
    const bound = app.get(WechatWebFlow);
    bound.finish = flow.finish.bind(flow);
    bound.start = proof => {
      const start = flow.start(proof), url = new URL(start.url);
      return { browser: start.browser, url: authorize + url.search };
    };
    await app.listen(port, '127.0.0.1');
    db = app.get(DatabaseService).client;
    await db.user.create({ data: { id: userId, webEnabled: true,
      passwordCredential: { create: { passwordHash: await hashPassword(password) } } } });
    createdFixture = true;
    const post = (route, body, headers = {}) => fetch(origin + route, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-EPP-Request': '1', ...headers }, body: JSON.stringify(body) });
    const login = await post('/auth/login', { userId, password });
    if (!login.ok) throw Error('Fixture login failed');
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    const csrf = await fetch(origin + '/auth/csrf', { headers: { cookie } }).then(r => r.json());
    const headers = { cookie, 'X-CSRF-Token': csrf.csrfToken };
    const made = await post('/captures', { originalText: 'A record saved before website login.' }, headers);
    if (made.status !== 201) throw Error('Fixture creation failed');
    capture = await made.json();
    if ((await post('/auth/logout', {}, headers)).status !== 204) throw Error('Fixture logout failed');
    return { origin, appId, userId, password, capture, db, close };
  } catch (error) { await close(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lab = await startWechatLab();
  const tty = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('在浏览器打开 ' + lab.origin + '/auth/wechat-web。首次选择关联已有账号。');
    console.log({ userId: lab.userId, password: lab.password, captureId: lab.capture.id });
    await tty.question('观察结束后按 Return 清理本轮实验并退出。\n');
  } finally { tty.close(); await lab.close(); }
}
