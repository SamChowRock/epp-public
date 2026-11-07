import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { parseConfig } from '../dist/src/config.js';
import { WechatLogin } from '../dist/src/wechat-login.js';
import { MiniService } from '../dist/src/mini.service.js';
import { MiniLoginSchema } from '../dist/src/mini-contract.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { SessionService } from '../dist/src/session.service.js';
import { ApplicationState } from '../dist/src/application-state.js';
import { hashPassword } from '../dist/src/password.js';
import { removeTestCaptures } from './cleanup.mjs';
import { createOpenApiDocument } from '../dist/src/openapi.js';
const appId = 'wx0000000000000037', secret = '1'.repeat(32), password = 'Fictional mini password 37';
const code = value => error => error.code === value;

test('provider uses a fixed URL, bounded response, no redirect/retry and no credential-bearing errors', async () => {
  let calls = 0;
  const provider = new WechatLogin({ appId, secret }, async (url, options) => {
    calls++; assert.equal(url.origin + url.pathname, 'https://api.weixin.qq.com/sns/jscode2session');
    assert.equal(url.searchParams.get('js_code'), 'once'); assert.equal(options.redirect, 'error');
    assert(options.signal instanceof AbortSignal);
    return Response.json({ openid: 'fictional_openid', session_key: 'not-for-client', unionid: 'not-an-account-key' });
  });
  assert.deepEqual(await provider.exchange('once'), { appId, openId: 'fictional_openid' }); assert.equal(calls, 1);
  for (const reply of [Response.json({ errcode: -1, errmsg: secret }), Response.json({ errcode: 45011 }), Response.json({}),
    new Response('x'.repeat(8193)), new Response('invalid json'), new Response('failure', { status: 500 })]) {
    const instance = new WechatLogin({ appId, secret }, async () => reply);
    await assert.rejects(instance.exchange('once'), e => e.code === 'PLATFORM_UNAVAILABLE' && !JSON.stringify(e).includes(secret));
  }
  await assert.rejects(new WechatLogin({ appId, secret }, async () => { throw new Error(secret); }).exchange('once'), code('PLATFORM_UNAVAILABLE'));
  await assert.rejects(new WechatLogin({ appId, secret }, async () => Response.json({ errcode: 40029 })).exchange('once'), code('PLATFORM_CODE_INVALID'));
  await assert.rejects(new WechatLogin(undefined).exchange('once'), code('MINI_NOT_CONFIGURED'));
  let release; const gate = new Promise(r => release = r);
  const busy = new WechatLogin({ appId, secret }, async () => { await gate; return Response.json({ openid: 'fixture' }); });
  const work = [busy.exchange('a'), busy.exchange('b')];
  await assert.rejects(busy.exchange('c'), code('PLATFORM_BUSY')); release(); await Promise.all(work);
  assert.equal((await busy.exchange('d')).appId, appId);
});

test('configuration and public schemas do not accept client identity assertions', () => {
  assert.throws(() => parseConfig({ port: 3000 }, { WECHAT_APP_ID: appId }), /WECHAT_APP_ID\/WECHAT_APP_SECRET/);
  assert.throws(() => parseConfig({ port: 3000 }, { WECHAT_APP_SECRET: secret }), /WECHAT_APP_ID\/WECHAT_APP_SECRET/);
  for (const extra of [{ userId: randomUUID() }, { openid: 'target' }, { appId }, { unionid: 'target' }]) {
    assert.equal(MiniLoginSchema.safeParse({ code: 'valid', ...extra }).success, false);
  }
  const doc = createOpenApiDocument();
  assert.deepEqual(doc.paths['/auth/mini/login'].post.security, []);
  assert.deepEqual(doc.paths['/auth/password'].post.security, [{ sessionCookie: [] }]);
  assert.equal(doc.components.securitySchemes.miniBearer.scheme, 'bearer');
});

async function fixture(t) {
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  const database = app.get(DatabaseService), db = database.client, sessions = app.get(SessionService), state = app.get(ApplicationState);
  const users = [randomUUID(), randomUUID()], openIds = [], captures = [];
  const hash = await hashPassword(password);
  for (const id of users) await db.user.create({ data: { id, miniEnabled: true, webEnabled: true,
    passwordCredential: { create: { passwordHash: hash } } } });
  const platform = { async exchange(value) { return { appId, openId: value }; } };
  const mini = new MiniService(database, sessions, state, platform);
  t.after(async () => {
    try {
      const mapped = await db.wechatIdentity.findMany({ where: { appId, openId: { in: openIds } } });
      const ids = [...new Set([...users, ...mapped.map(x => x.userId)])];
      const rows = await db.capture.findMany({ where: { userId: { in: ids } }, select: { id: true } });
      await removeTestCaptures(db, rows.map(x => x.id), new Set());
      await db.wechatIdentity.deleteMany({ where: { userId: { in: ids } } });
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.passwordCredential.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    } finally { await app.close(); }
  });
  const fresh = () => { const value = randomUUID(); openIds.push(value); return value; };
  const request = async (path, token, options = {}) => {
    const response = await fetch((await app.getUrl()) + path, { ...options,
      headers: { 'X-EPP-Request': '1', 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers } });
    const text = await response.text(); return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : undefined };
  };
  return { app, db, database, mini, sessions, state, users, fresh, request, platform };
}

test('concurrent first login creates one local user; app-scoped identity does not grant either entry', async t => {
  const f = await fixture(t), openId = f.fresh();
  const results = await Promise.allSettled([1, 2].map(() => f.mini.login({ code: openId, label: 'First' })));
  assert(results.every(x => x.status === 'fulfilled' && x.value.miniEnabled === false && !('token' in x.value)));
  assert.equal(results[0].value.userId, results[1].value.userId);
  assert.equal(await f.db.wechatIdentity.count({ where: { appId, openId } }), 1);
  const identity = await f.db.wechatIdentity.findUniqueOrThrow({ where: { appId_openId: { appId, openId } } });
  const user = await f.db.user.findUniqueOrThrow({ where: { id: identity.userId } });
  assert.equal(user.miniEnabled, false); assert.equal(user.webEnabled, false);
  assert.equal(await f.db.session.count({ where: { userId: user.id } }), 0);
  await f.db.user.update({ where: { id: user.id }, data: { miniEnabled: true } });
  const session = await f.mini.login({ code: openId, label: 'Enabled' }); assert.equal(session.userId, user.id);
  await assert.rejects(f.mini.link({ code: openId, label: 'No merge', userId: f.users[0], password }), code('IDENTITY_CONFLICT'));
});

test('link proves both identities, preserves existing records, rejects crossed transports and ownership', async t => {
  const f = await fixture(t), openId = f.fresh();
  await assert.rejects(f.mini.link({ code: openId, label: 'Wrong', userId: f.users[0], password: 'wrong' }), code('AUTH_REQUIRED'));
  assert.equal(await f.db.wechatIdentity.count({ where: { appId, openId } }), 0);
  const web = await f.sessions.login({ userId: f.users[0], password, label: 'Web before link' });
  const csrf = await fetch((await f.app.getUrl()) + '/auth/csrf', { headers: { Cookie: 'epp_session=' + web.token } }).then(r => r.json());
  const old = await f.request('/captures', undefined, { method: 'POST', headers: { Cookie: 'epp_session=' + web.token, 'X-CSRF-Token': csrf.csrfToken }, body: JSON.stringify({ originalText: 'Before linking chapter 37.' }) });
  assert.equal(old.status, 201);
  const mini = await f.mini.link({ code: openId, userId: f.users[0], password, label: 'Mini linked' });
  assert.equal(mini.userId, web.identity.userId);
  assert.deepEqual((await f.request('/captures/' + old.body.id, mini.token)).body, old.body);
  const foreign = await f.mini.link({ code: f.fresh(), userId: f.users[1], password, label: 'Other' });
  assert.equal((await f.request('/captures/' + old.body.id, foreign.token)).status, 404);
  assert.equal((await f.request('/auth/me', web.token)).status, 401);
  assert.equal((await f.request('/auth/me', undefined, { headers: { Cookie: 'epp_session=' + mini.token } })).status, 401);
  assert.equal((await f.request('/auth/me', mini.token, { headers: { Cookie: 'epp_session=' + web.token } })).body.code, 'AUTH_AMBIGUOUS');
  assert.equal((await f.request('/auth/csrf', mini.token)).body.code, 'SESSION_CHANNEL_DENIED');
  assert.equal((await f.request('/auth/password', mini.token, { method: 'POST', body: JSON.stringify({ currentPassword: password, newPassword: password }) })).body.code, 'SESSION_CHANNEL_DENIED');
  const own = await f.request('/captures', mini.token, { method: 'POST', body: JSON.stringify({ originalText: 'Bearer write.' }) });
  assert.equal(own.status, 201); assert.equal(own.headers.get('set-cookie'), null);
  assert.match(own.headers.get('vary'), /Authorization/);
  assert.equal((await f.request('/auth/sessions/' + mini.sessionId, foreign.token, { method: 'DELETE' })).status, 204);
  assert.equal((await f.request('/auth/me', mini.token)).status, 200);
  const list = await f.request('/auth/sessions', mini.token);
  assert.deepEqual(new Set(list.body.items.map(x => x.channel)), new Set(['web', 'mini']));
  await assert.rejects(f.mini.link({ code: f.fresh(), userId: f.users[0], password, label: 'Replace forbidden' }), code('IDENTITY_CONFLICT'));
  await f.sessions.changePassword(web.identity, { currentPassword: password, newPassword: password + ' changed' });
  assert.equal((await f.request('/auth/me', mini.token)).status, 401);
  assert.equal(await f.sessions.authenticate(web.token), undefined);
});

test('entry changes, expiry and logout retain independent channels and all-session limits', async t => {
  const f = await fixture(t), openId = f.fresh();
  const login = await f.mini.link({ code: openId, userId: f.users[0], password, label: 'Mini' });
  await f.db.user.update({ where: { id: f.users[0] }, data: { webEnabled: false } });
  assert.equal((await f.request('/auth/me', login.token)).status, 200);
  await f.db.user.update({ where: { id: f.users[0] }, data: { miniEnabled: false } });
  assert.equal((await f.request('/auth/me', login.token)).body.code, 'MINI_ACCESS_DENIED');
  const out = await f.request('/auth/logout', login.token, { method: 'POST', body: '{}' });
  assert.equal(out.status, 204); assert.equal(out.headers.get('set-cookie'), null);
  assert.equal((await f.request('/auth/me', login.token)).status, 401);
  await f.db.user.update({ where: { id: f.users[0] }, data: { miniEnabled: true } });
  const expired = await f.mini.login({ code: openId, label: 'Expire' });
  await f.db.session.update({ where: { id: expired.sessionId }, data: { createdAt: new Date(Date.now()-7200000), expiresAt: new Date(Date.now()-3600000) } });
  assert.equal((await f.request('/auth/me', expired.token)).status, 401);
  for (let n=0;n<20;n++) await f.mini.login({ code: openId, label: 'Bound' });
  await assert.rejects(f.mini.login({ code: openId, label: '21' }), code('SESSION_LIMIT'));
  await f.db.user.update({ where: { id: f.users[0] }, data: { status: 'disabled' } });
  await assert.rejects(f.mini.login({ code: openId, label: 'Disabled' }), code('ACCOUNT_DISABLED'));
  assert.equal(f.state.active, 0);
});

test('a credential changed during platform exchange cannot establish an account association', async t => {
  const f = await fixture(t), openId = f.fresh();
  let release, entered;
  const gate = new Promise(r => release = r), ready = new Promise(r => entered = r);
  f.platform.exchange = async value => { entered(); await gate; return { appId, openId: value }; };
  const binding = f.mini.link({ code: openId, userId: f.users[0], password, label: 'Race' });
  await ready;
  await f.db.passwordCredential.update({ where: { userId: f.users[0] }, data: { passwordHash: await hashPassword(password + ' changed'), version: { increment: 1 } } });
  release(); await assert.rejects(binding, code('AUTH_REQUIRED'));
  assert.equal(await f.db.wechatIdentity.count({ where: { appId, openId } }), 0);
});

test('public HTTP login validates code once, preserves a committed pending mapping and returns no cookie', async t => {
  const originalFetch = globalThis.fetch, used = new Set(), openId = randomUUID();
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    if (url.origin !== 'https://api.weixin.qq.com') return originalFetch(input, options);
    const value = url.searchParams.get('js_code');
    if (used.has(value)) return Response.json({ errcode: 40029 });
    used.add(value); return Response.json({ openid: openId });
  };
  let app;
  try { app = await createApp(parseConfig({ port: 3000 }, { NODE_ENV: 'test', LOG_LEVEL: 'error', WECHAT_APP_ID: appId, WECHAT_APP_SECRET: secret })); }
  finally { globalThis.fetch = originalFetch; }
  const db = app.get(DatabaseService).client;
  t.after(async () => {
    try {
      const mapping = await db.wechatIdentity.findUnique({ where: { appId_openId: { appId, openId } } });
      if (mapping) {
        await db.session.deleteMany({ where: { userId: mapping.userId } });
        await db.wechatIdentity.delete({ where: { appId_openId: { appId, openId } } });
        await db.user.delete({ where: { id: mapping.userId } });
      }
    } finally { await app.close(); }
  });
  await app.listen(0, '127.0.0.1');
  const send = body => fetch(app.getHttpServer().address() ? 'http://127.0.0.1:' + app.getHttpServer().address().port + '/auth/mini/login' : '', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-EPP-Request': '1' }, body: JSON.stringify(body),
  });
  assert.equal((await send({ code: 'one', openid: 'forged' })).status, 400);
  assert.equal(used.size, 0);
  const pending = await send({ code: 'one' }); assert.equal(pending.status, 200);
  const pendingBody = await pending.json(); assert.equal(pendingBody.miniEnabled, false);
  assert.deepEqual(Object.keys(pendingBody).sort(), ['miniEnabled', 'userId']);
  const mapping = await db.wechatIdentity.findUniqueOrThrow({ where: { appId_openId: { appId, openId } } });
  assert.equal(pendingBody.userId, mapping.userId);
  await db.user.update({ where: { id: mapping.userId }, data: { miniEnabled: true } });
  assert.equal((await send({ code: 'one' })).status, 401);
  const login = await send({ code: 'two' }); assert.equal(login.status, 200);
  assert.equal(login.headers.get('set-cookie'), null); assert.equal(login.headers.get('cache-control'), 'private, no-store');
  const result = await login.json(); assert.equal(result.userId, mapping.userId); assert.equal(result.expiresIn, 28800);
  assert.deepEqual(Object.keys(result).sort(), ['expiresIn', 'sessionId', 'token', 'userId']);
});
