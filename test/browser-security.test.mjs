import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { issueToken, tokenDigest } from '../dist/src/token.js';
import { parseConfig } from '../dist/src/config.js';
import { csrfToken, requireCsrf, authRateLimit } from '../dist/src/browser-security.js';

const config = (env = {}) => parseConfig({ port: 3000 }, { NODE_ENV: 'test', ...env });

test('CSRF binds the session and secret; proxy configuration is explicit and validated', () => {
  const key = 'ab'.repeat(32), id = randomUUID(), token = csrfToken(key, id);
  requireCsrf(token, key, id);
  for (const value of [undefined, '', token + '0', '0'.repeat(64), [token]]) assert.throws(() => requireCsrf(value, key, id));
  assert.throws(() => requireCsrf(token, key, randomUUID()));
  assert.throws(() => requireCsrf(token, 'cd'.repeat(32), id));
  for (const value of ['true', '1', '*', '', '127.0.0.1,', '127.0.0.1/8']) assert.throws(() => config({ TRUST_PROXY_IPS: value }));
  assert.deepEqual(config().trustedProxyIps, []);
  assert.deepEqual(config({ TRUST_PROXY_IPS: '127.0.0.1,::1' }).trustedProxyIps, ['127.0.0.1', '::1']);
});

test('HTTP defenses reject before mutation; token endpoint, restricted logout and old records remain usable', async t => {
  const app = await createApp(config()), db = app.get(DatabaseService).client;
  const userId = randomUUID(), sessionId = randomUUID(), token = issueToken();
  await db.user.create({ data: { id: userId, webEnabled: true } });
  await db.session.create({ data: { id: sessionId, userId, tokenDigest: tokenDigest(token), label: 'Browser boundary test', expiresAt: new Date(Date.now() + 3600000) } });
  t.after(async () => {
    try {
      await db.captureRevision.deleteMany({ where: { capture: { userId } } });
      await db.capture.deleteMany({ where: { userId } });
      await db.session.deleteMany({ where: { userId } }); await db.user.delete({ where: { id: userId } });
    } finally { await app.close(); }
  });
  await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
  const headers = { Cookie: 'epp_session=' + token, 'content-type': 'application/json', 'X-EPP-Request': '1' };
  const get = path => fetch(base + path, { headers });
  const csrf = await get('/auth/csrf'); assert.equal(csrf.status, 200);
  assert.equal(csrf.headers.get('cache-control'), 'private, no-store');
  const value = (await csrf.json()).csrfToken;
  const send = (extra = {}, body = '{"originalText":"Boundary fixture"}') => fetch(base + '/captures', {
    method: 'POST', headers: { ...headers, 'X-CSRF-Token': value, ...extra }, body,
  });
  for (const extra of [{ 'X-CSRF-Token': '' }, { 'X-CSRF-Token': '0'.repeat(64) }, { 'X-EPP-Request': '' },
    { Origin: 'http://127.0.0.1:4000' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await send(extra)).status, 403);
  }
  assert.equal(await db.capture.count({ where: { userId } }), 0);
  assert.equal((await send({ 'content-type': 'text/plain' })).status, 415);
  assert.equal((await send({}, ' '.repeat(16385))).status, 413);
  assert.equal((await send({}, '{')).status, 400);
  const created = await send(); assert.equal(created.status, 201);
  assert.equal(created.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(created.headers.get('x-frame-options'), 'DENY');
  assert.equal(created.headers.get('x-powered-by'), null);
  assert.match(created.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(created.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(base + '/captures', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:4000', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.status, 405); assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  assert.equal(await db.capture.count({ where: { userId } }), 1);
  await db.user.update({ where: { id: userId }, data: { webEnabled: false } });
  assert.equal((await get('/auth/me')).status, 403); assert.equal((await get('/auth/csrf')).status, 200);
  const out = await fetch(base + '/auth/logout', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': value }, body: '{}' });
  assert.equal(out.status, 204); assert.equal(await db.session.count({ where: { userId } }), 0);
  assert.equal((await get('/auth/csrf')).status, 401);
  assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers, body: '{}' })).status, 204);
});

test('forged forwarding cannot evade a direct peer bucket; only a trusted proxy enables client buckets', async t => {
  for (const trust of [false, ['127.0.0.1']]) {
    const app = express(); app.set('trust proxy', trust); app.use(authRateLimit());
    app.post('/auth/login', (req, res) => res.json({ ip: req.ip, protocol: req.protocol }));
    app.use((err, req, res, next) => res.status(err.statusCode ?? 500).json({ code: err.code }));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = 'http://127.0.0.1:' + server.address().port;
    for (let i = 0; i < 11; i++) {
      const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': '192.0.2.' + (i + 1), 'X-Forwarded-Proto': 'https' } });
      assert.equal(r.status, trust || i < 10 ? 200 : 429);
      if (r.status === 200) assert.deepEqual(await r.json(), { ip: trust ? '192.0.2.' + (i + 1) : '127.0.0.1', protocol: trust ? 'https' : 'http' });
      else assert(Number(r.headers.get('retry-after')) > 0);
    }
  }
});

test('password work admits two operations, rejects overflow and releases capacity after failure', async () => {
  const { SessionService } = await import('../dist/src/session.service.js');
  const { ApplicationState } = await import('../dist/src/application-state.js');
  const pending = [], state = new ApplicationState();
  const service = new SessionService({ run: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) }, state);
  const input = { userId: randomUUID(), password: 'Fabricated capacity password' };
  const first = service.login(input), second = service.login(input);
  const failed = Promise.allSettled([first, second]);
  assert.throws(() => service.login(input), error => error.code === 'AUTH_BUSY' && error.statusCode === 429);
  assert.equal(pending.length, 2);
  pending[0].reject(new Error('controlled storage failure')); pending[1].reject(new Error('controlled storage failure'));
  assert((await failed).every(x => x.status === 'rejected'));
  await state.whenIdle();
  const recovered = service.login(input); const result = assert.rejects(recovered, /controlled/);
  assert.equal(pending.length, 3); pending[2].reject(new Error('controlled storage failure')); await result;
  await state.whenIdle();
});

test('full rate table rejects new sources, preserves old buckets, and expires without eviction', t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const middleware = authRateLimit();
  const send = ip => {
    const headers = {}; let error;
    middleware({ method: 'POST', path: '/auth/login', ip, socket: {} },
      { setHeader: (k, v) => { headers[k] = v; } }, value => { error = value; });
    return { code: error?.code, headers };
  };
  for (let i = 0; i < 1000; i++) assert.equal(send('192.0.2.' + i).code, undefined);
  assert.equal(send('new').code, 'AUTH_RATE_LIMIT'); assert.equal(send('new').headers['Retry-After'], '60');
  for (let i = 1; i < 10; i++) assert.equal(send('192.0.2.0').code, undefined);
  assert.equal(send('192.0.2.0').code, 'AUTH_RATE_LIMIT');
  now = 60000; assert.equal(send('new').code, undefined); assert.equal(send('192.0.2.0').code, undefined);
});
