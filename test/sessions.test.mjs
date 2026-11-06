import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/src/app.js';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../dist/src/database.service.js';
import { hashPassword } from '../dist/src/password.js';
import { tokenDigest } from '../dist/src/token.js';
import { removeTestCaptures } from './cleanup.mjs';

const password = 'Fabricated session test password';
async function fixture(t) {
  const app = await createApp(), db = app.get(DatabaseService).client;
  const users = [randomUUID(), randomUUID()];
  const hash = await hashPassword(password);
  for (const id of users) await db.user.create({ data: { id, webEnabled: true, passwordCredential: { create: { passwordHash: hash } } } });
  t.after(async () => {
    try {
      const captures = await db.capture.findMany({ where: { userId: { in: users } }, select: { id: true } });
      await removeTestCaptures(db, captures.map(x => x.id), new Set());
      await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.passwordCredential.deleteMany({ where: { userId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    } finally { await app.close(); }
  });
  await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
  async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    const csrf = cookie ? await fetch(base + '/auth/csrf', { headers: { Cookie: cookie } }).then(r => r.json()) : {};
    const response = await fetch(base + path, { method,
      headers: { 'X-EPP-Request': '1', ...(csrf.csrfToken ? { 'X-CSRF-Token': csrf.csrfToken } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined, headers: response.headers,
      cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = (userId = users[0]) => request('/auth/login', { method: 'POST', body: { userId, password, label: 'Regression device' } });
  return { app, db, users, request, login };
}

test('existing business API requires a live session instead of a fixed development identity', async t => {
  const app = await createApp();
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const response = await fetch((await app.getUrl()) + '/captures');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
});

test('login issues opaque cookies; expiry, owned revocation and repeated logout fail closed', async t => {
  const { db, users, request, login } = await fixture(t);
  const bad = await request('/auth/login', { method: 'POST', body: { userId: users[0], password: 'Wrong fabricated password' } });
  const absent = await request('/auth/login', { method: 'POST', body: { userId: randomUUID(), password } });
  assert.equal(bad.status, 401); assert.deepEqual(absent.body, bad.body);
  const a = await login(), b = await login();
  assert.equal(a.status, 200); assert.notEqual(a.cookie, b.cookie);
  assert.match(a.headers.get('set-cookie'), /HttpOnly/); assert.match(a.headers.get('set-cookie'), /SameSite=Strict/);
  assert.match(a.headers.get('set-cookie'), /Path=\//); assert.equal(a.headers.get('cache-control'), 'private, no-store');
  const stored = await db.session.findUniqueOrThrow({ where: { id: a.body.sessionId } });
  assert.equal(stored.tokenDigest, tokenDigest(a.cookie.split('=')[1]));
  assert.equal('token' in a.body, false); assert.equal('tokenDigest' in a.body, false);
  assert.equal((await request('/auth/me', { cookie: a.cookie })).body.userId, users[0]);
  const list = (await request('/auth/sessions', { cookie: a.cookie })).body;
  assert.equal(list.items.length, 2); assert.equal(list.items.filter(x => x.current).length, 1);
  assert(!JSON.stringify(list).includes(stored.tokenDigest));
  assert.equal((await request('/auth/sessions/' + b.body.sessionId, { method: 'DELETE', cookie: a.cookie })).status, 204);
  assert.equal((await request('/captures', { cookie: b.cookie })).status, 401);
  assert.equal((await request('/captures', { cookie: a.cookie })).status, 200);
  await db.session.update({ where: { id: a.body.sessionId }, data: {
    createdAt: new Date(Date.now() - 7200000), expiresAt: new Date(Date.now() - 1000),
  } });
  assert.equal((await request('/captures', { cookie: a.cookie })).status, 401);
  for (const cookie of [a.cookie, undefined]) {
    const out = await request('/auth/logout', { method: 'POST', body: {}, cookie });
    assert.equal(out.status, 204); assert.match(out.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  }
});

test('request scoped ownership separates all existing reads, writes and operation identities', async t => {
  const { users, request, login } = await fixture(t);
  const logins = await Promise.all(users.map(id => login(id))), operationId = randomUUID();
  const captures = await Promise.all(logins.map((a, i) => request('/captures', {
    method: 'POST', cookie: a.cookie, body: { originalText: 'Owned capture ' + i },
  })));
  assert.deepEqual(captures.map(x => x.status), [201, 201]);
  const revisions = await Promise.all(logins.map((a, i) => request('/captures/' + captures[i].body.id + '/revisions', { cookie: a.cookie })));
  const candidates = await Promise.all(logins.map((a, i) => request('/revisions/' + revisions[i].body.items[0].id + '/candidates', {
    method: 'POST', cookie: a.cookie, body: { candidateNo: 1, englishText: 'Same words in two accounts.', chineseMeaning: '同一表达。' },
  })));
  const adopted = await Promise.all(logins.map((a, i) => request('/candidates/' + candidates[i].body.id + '/accept', {
    method: 'POST', cookie: a.cookie, body: { operationId },
  })));
  assert.deepEqual(adopted.map(x => x.status), [201, 201]);
  assert.notEqual(adopted[0].body.expression.id, adopted[1].body.expression.id);
  for (let i = 0; i < 2; i++) {
    const own = logins[i].cookie, other = 1 - i;
    assert.equal((await request('/captures', { cookie: own })).body.items.length, 1);
    assert.equal((await request('/learning-records', { cookie: own })).body.items.length, 1);
    assert.equal((await request('/star-map', { cookie: own })).body.nodes.length, 1);
    for (const path of ['/captures/' + captures[other].body.id, '/captures/' + captures[other].body.id + '/revisions',
      '/revisions/' + revisions[other].body.items[0].id + '/candidates', '/learning-records/' + adopted[other].body.learningRecord.id]) {
      assert.equal((await request(path, { cookie: own })).status, 404, path);
    }
    assert.equal((await request('/candidates/' + candidates[other].body.id + '/accept', { method: 'POST', cookie: own, body: { operationId } })).status, 404);
    assert.equal((await request('/captures/' + captures[other].body.id, { method: 'PATCH', cookie: own, body: { chineseIntent: 'Cannot replace' } })).status, 404);
    assert.equal((await request('/auth/sessions/' + logins[other].body.sessionId, { method: 'DELETE', cookie: own })).status, 204);
    assert.equal((await request('/auth/me', { cookie: logins[other].cookie })).status, 200);
  }
});

test('password change revokes every session and cookie boundaries reject ambiguous or foreign input', async t => {
  const { db, users, request, login } = await fixture(t);
  const a = await login(), b = await login();
  assert.equal((await request('/captures', { cookie: a.cookie + '; ' + b.cookie })).status, 400);
  assert.equal((await request('/captures', { cookie: 'epp_session=invalid' })).status, 401);
  for (const origin of ['null', 'https://untrusted.example', 'http://127.0.0.1:9000']) {
    assert.equal((await request('/auth/logout', { method: 'POST', body: {}, cookie: a.cookie, headers: { Origin: origin } })).status, 403);
  }
  const newPassword = 'Another fabricated session password';
  assert.equal((await request('/auth/password', { method: 'POST', cookie: a.cookie,
    body: { currentPassword: 'Wrong fabricated password', newPassword } })).status, 401);
  assert.equal((await request('/auth/password', { method: 'POST', cookie: a.cookie,
    body: { currentPassword: password, newPassword: 'short' } })).status, 400);
  const changed = await request('/auth/password', { method: 'POST', cookie: a.cookie, body: { currentPassword: password, newPassword } });
  assert.equal(changed.status, 204); assert.match(changed.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.equal(await db.session.count({ where: { userId: users[0] } }), 0);
  assert.equal((await request('/captures', { cookie: a.cookie })).status, 401);
  assert.equal((await request('/captures', { cookie: b.cookie })).status, 401);
  assert.equal((await login()).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { userId: users[0], password: newPassword } })).status, 200);
});

test('password change rechecks expiry after waiting for a session row lock', async t => {
  const { app, db, users, login, request } = await fixture(t);
  const a = await login(), blocker = await app.get(DatabaseService).pool.connect();
  let change;
  try {
    await db.$executeRaw`UPDATE public.sessions SET expires_at = clock_timestamp() + interval '700 milliseconds' WHERE id = ${a.body.sessionId}::uuid`;
    await blocker.query('BEGIN');
    const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await blocker.query('SELECT id FROM public.sessions WHERE id=$1 FOR UPDATE', [a.body.sessionId]);
    change = request('/auth/password', { method: 'POST', cookie: a.cookie,
      body: { currentPassword: password, newPassword: 'New password after session lock' } });
    let waiting = false;
    for (let i = 0; i < 50; i++) {
      const rows = await db.$queryRaw`SELECT pid FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
      if (rows.length) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert(waiting, 'the password transaction must actually wait for the session lock');
    while (!(await db.$queryRaw`SELECT expires_at <= clock_timestamp() AS expired FROM public.sessions WHERE id = ${a.body.sessionId}::uuid`)[0].expired) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await blocker.query('ROLLBACK');
    assert.equal((await change).status, 401);
    assert.equal((await login(users[0])).status, 200, 'old password remains valid');
  } finally {
    await blocker.query('ROLLBACK'); blocker.release();
    if (change) await change;
  }
});

test('Postman auth scripts preserve quoted and escaped passwords through real HTTP login and change', async t => {
  const { app, db, users } = await fixture(t);
  const { readFile } = await import('node:fs/promises'), { runInNewContext } = await import('node:vm');
  const collection = JSON.parse(await readFile(new URL('../requests/chapter-33.postman_collection.json', import.meta.url)));
  const original = 'Quoted " password \\ with {{literal}} braces';
  const replacement = 'Another " password \\ with Unicode：中文';
  await db.passwordCredential.update({ where: { userId: users[0] }, data: { passwordHash: await hashPassword(original) } });
  const values = new Map([['userId', users[0]], ['password', original], ['newPassword', replacement]]);
  const pm = { variables: { get: key => values.get(key), set: (key, value) => values.set(key, value) } };
  async function send(item, cookie) {
    const script = item.event.find(x => x.listen === 'prerequest').script.exec.join('\n');
    runInNewContext(script, { pm });
    assert.equal(item.request.body.raw, '{{authBody}}');
    const body = values.get('authBody');
    assert(!body.includes('{{'), 'serialized secrets must not expose nested Postman templates');
    return fetch((await app.getUrl()) + item.request.url.replace('{{baseUrl}}', ''), {
      method: 'POST', headers: { 'X-EPP-Request': '1', ...(cookie ? { 'X-CSRF-Token': (await (await fetch((await app.getUrl()) + '/auth/csrf', { headers: { cookie } })).json()).csrfToken } : {}), 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body,
    });
  }
  const login = await send(collection.item[0]); assert.equal(login.status, 200);
  assert.equal(JSON.parse(values.get('authBody')).password, original);
  const changed = await send(collection.item[8], login.headers.get('set-cookie').split(';')[0]);
  assert.equal(changed.status, 204);
  assert.equal(JSON.parse(values.get('authBody')).newPassword, replacement);
  values.set('password', replacement);
  assert.equal((await send(collection.item[0])).status, 200);
});

test('session count and login attempt limits reject new work without revoking existing sessions', async t => {
  const { db, users, request, login } = await fixture(t);
  const a = await login();
  await db.session.createMany({ data: Array.from({ length: 19 }, () => ({
    id: randomUUID(), userId: users[0], tokenDigest: randomUUID().replaceAll('-', '').repeat(2),
    label: 'Count limit fixture', expiresAt: new Date(Date.now() + 3600000),
  })) });
  const full = await login();assert.equal(full.status, 429);assert.equal(full.body.code, 'SESSION_LIMIT');
  assert.equal(await db.session.count({ where: { userId: users[0] } }), 20);
  assert.equal((await request('/auth/me', { cookie: a.cookie })).status, 200);
  const other = await db.session.findFirstOrThrow({ where: { userId: users[0], id: { not: a.body.sessionId } } });
  assert.equal((await request('/auth/sessions/' + other.id, { method: 'DELETE', cookie: a.cookie })).status, 204);
  assert.equal((await login()).status, 200);
  for (let i = 0; i < 7; i++) assert.equal((await request('/auth/login', { method: 'POST', body: { userId: users[0], password: 'Wrong long password' } })).status, 401);
  const limited = await login();assert.equal(limited.status, 429);assert.equal(limited.body.code, 'AUTH_RATE_LIMIT');
  assert(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await request('/auth/me', { cookie: a.cookie })).status, 200);
});
