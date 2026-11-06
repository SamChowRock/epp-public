import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { hashPassword, verifyPassword } from '../dist/src/password.js';

const password = 'Fabricated authorization password';
async function fixture(t) {
  const app = await createApp(), database = app.get(DatabaseService), db = database.client, userId = randomUUID();
  t.after(async () => {
    try {
      await db.captureRevision.deleteMany({ where: { capture: { userId } } });
      await db.capture.deleteMany({ where: { userId } });
      await db.session.deleteMany({ where: { userId } });
      await db.passwordCredential.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    } finally { await app.close(); }
  });
  await db.user.create({ data: { id: userId, passwordCredential: { create: { passwordHash: await hashPassword(password) } } } });
  await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
  async function request(path, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(base + path, { method, headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined, headers: response.headers,
      cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = (value = password) => request('/auth/login', { method: 'POST', body: { userId, password: value } });
  return { db, database, userId, request, login };
}

test('a newly created account does not receive Web access implicitly', async t => {
  const { db, userId, login } = await fixture(t);
  const denied = await login();
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'WEB_ACCESS_DENIED');
  assert.equal(denied.cookie, undefined);
  assert.equal(await db.session.count({ where: { userId } }), 0);
});

test('client fields cannot replace the session owner or change account eligibility', async t => {
  const { db, userId, request, login } = await fixture(t);
  await db.user.update({ where: { id: userId }, data: { webEnabled: true } });
  const signedIn = await login();
  const result = await request('/captures', { method: 'POST', cookie: signedIn.cookie,
    body: { originalText: 'Owned by the authenticated user', userId: randomUUID(), status: 'disabled', webEnabled: false } });
  assert.equal(result.status, 201);
  assert.equal((await db.capture.findUniqueOrThrow({ where: { id: result.body.id } })).userId, userId);
  const account = await db.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(account.status, 'active'); assert.equal(account.webEnabled, true);
});

test('eligibility changes affect the next request without changing the session lifetime; logout remains available', async t => {
  const { db, userId, request, login } = await fixture(t);
  await db.user.update({ where: { id: userId }, data: { webEnabled: true } });
  const a = await login(); assert.equal(a.status, 200);
  const session = await db.session.findUniqueOrThrow({ where: { id: a.body.sessionId } });
  const credential = await db.passwordCredential.findUniqueOrThrow({ where: { userId } });
  for (const [data, code] of [[{ webEnabled: false }, 'WEB_ACCESS_DENIED'], [{ status: 'disabled' }, 'ACCOUNT_DISABLED']]) {
    await db.user.update({ where: { id: userId }, data });
    for (const path of ['/auth/me', '/auth/sessions', '/captures', '/learning-records', '/star-map']) {
      const denied = await request(path, { cookie: a.cookie });
      assert.equal(denied.status, 403); assert.equal(denied.body.code, code);
      assert.equal(denied.headers.get('cache-control'), 'private, no-store');
    }
    assert.equal((await request('/captures', { method: 'POST', cookie: a.cookie, body: { originalText: 'Must not be stored' } })).status, 403);
    assert.equal((await request('/auth/password', { method: 'POST', cookie: a.cookie,
      body: { currentPassword: password, newPassword: 'Must not replace the credential' } })).status, 403);
    assert.equal((await login('Wrong fabricated password')).status, 401);
    assert.equal((await login()).body.code, code);
    assert.deepEqual(await db.passwordCredential.findUnique({ where: { userId } }), credential);
    assert.deepEqual(await db.session.findUnique({ where: { id: session.id } }), session);
    await db.user.update({ where: { id: userId }, data: { status: 'active', webEnabled: true } });
    assert.equal((await request('/auth/me', { cookie: a.cookie })).status, 200);
  }
  await db.user.update({ where: { id: userId }, data: { status: 'disabled', webEnabled: false } });
  const logout = await request('/auth/logout', { method: 'POST', body: {}, cookie: a.cookie });
  assert.equal(logout.status, 204); assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  await db.user.update({ where: { id: userId }, data: { status: 'active', webEnabled: true } });
  assert.equal((await request('/auth/me', { cookie: a.cookie })).status, 401);
  assert.equal(await db.session.count({ where: { userId } }), 0);
  assert.equal(await db.capture.count({ where: { userId } }), 0);
});

async function waitForBlocker(db, blockerPid) {
  for (let i = 0; i < 70; i++) {
    const rows = await db.$queryRaw`SELECT pid FROM pg_stat_activity WHERE ${blockerPid}::int = ANY(pg_blocking_pids(pid))`;
    if (rows.length) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('expected an observed database row-lock wait');
}

test('eligibility is rechecked after login and password change wait for the account row', async t => {
  const { db, database, userId, request, login } = await fixture(t);
  await db.user.update({ where: { id: userId }, data: { webEnabled: true } });
  const a = await login(), credential = await db.passwordCredential.findUniqueOrThrow({ where: { userId } });
  for (const mode of ['login', 'password']) {
    const blocker = await database.pool.connect(); let pending;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('UPDATE public.users SET web_enabled=false WHERE id=$1', [userId]);
      pending = mode === 'login' ? login() : request('/auth/password', { method: 'POST', cookie: a.cookie,
        body: { currentPassword: password, newPassword: 'Not allowed after permission loss' } });
      await waitForBlocker(db, pid);
      await blocker.query('COMMIT');
      const denied = await pending; assert.equal(denied.status, 403); assert.equal(denied.body.code, 'WEB_ACCESS_DENIED');
      assert.deepEqual(await db.passwordCredential.findUnique({ where: { userId } }), credential);
      assert.equal(await db.session.count({ where: { userId } }), 1);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending; }
    await db.user.update({ where: { id: userId }, data: { webEnabled: true } });
  }
});

test('a sensitive transaction already holding the account lock completes before permission revocation', async t => {
  const { db, database, userId, request, login } = await fixture(t);
  await db.user.update({ where: { id: userId }, data: { webEnabled: true } });
  const a = await login();
  for (const mode of ['login', 'password']) {
    const blocker = await database.pool.connect(), manager = await database.pool.connect();
    let pending, revoke;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT user_id FROM public.password_credentials WHERE user_id=$1 FOR UPDATE', [userId]);
      pending = mode === 'login' ? login() : request('/auth/password', { method: 'POST', cookie: a.cookie,
        body: { currentPassword: password, newPassword: 'Committed before permission revocation' } });
      await waitForBlocker(db, pid);
      const holder = (await db.$queryRaw`SELECT pid FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`)[0].pid;
      revoke = manager.query('UPDATE public.users SET web_enabled=false WHERE id=$1', [userId]);
      await waitForBlocker(db, holder);
      await blocker.query('ROLLBACK');
      const result = await pending; assert.equal(result.status, mode === 'login' ? 200 : 204);
      await revoke;
      if (mode === 'login') {
        assert.equal((await request('/auth/me', { cookie: result.cookie })).status, 403);
      } else {
        assert.equal(await db.session.count({ where: { userId } }), 0);
        const credential = await db.passwordCredential.findUniqueOrThrow({ where: { userId } });
        assert(await verifyPassword(credential.passwordHash, 'Committed before permission revocation'));
        assert.equal((await request('/auth/me', { cookie: a.cookie })).status, 401);
      }
    } finally {
      await blocker.query('ROLLBACK'); blocker.release();
      if (pending) await pending; if (revoke) await revoke; manager.release();
    }
    await db.user.update({ where: { id: userId }, data: { webEnabled: true } });
  }
});
