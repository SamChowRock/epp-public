import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { csrfToken } from '../dist/src/browser-security.js';
import { APP_CONFIG } from '../dist/src/config.js';
import { issueToken, tokenDigest } from '../dist/src/token.js';

async function fixture(t) {
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const { client: db, pool } = app.get(DatabaseService);
  const url = await app.getUrl();
  const users = [randomUUID(), randomUUID()];
  t.after(async () => {
    try {
      await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    } finally { await app.close(); }
  });
  const headers = [];
  for (const userId of users) {
    await db.user.create({ data: { id: userId, webEnabled: true } });
    const id = randomUUID(), token = issueToken();
    await db.session.create({ data: { id, userId, tokenDigest: tokenDigest(token),
      label: 'Profile regression', expiresAt: new Date(Date.now() + 3600000) } });
    headers.push({ Cookie: 'epp_session=' + token, 'Content-Type': 'application/json',
      'X-EPP-Request': '1', 'X-CSRF-Token': csrfToken(app.get(APP_CONFIG).cursorKey, id) });
  }
  async function request(who, path, body) {
    const response = await fetch(url + path, { headers: headers[who],
      method: body === undefined ? 'GET' : 'PATCH', body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  return { db, pool, users, request, patch: body => request(0, '/profile/me', body) };
}

// pg_locks exposes live waits even if the locking transaction already has a statistics snapshot.
async function waitForBlockedWriters(locker, expected) {
  const { rows: [{ pid }] } = await locker.query('SELECT pg_backend_pid() AS pid');
  for (let attempt = 0; attempt < 70; attempt++) {
    // The second writer can wait on the first waiter instead of the initial locker.
    const { rows: [{ count }] } = await locker.query(`WITH RECURSIVE blocked(pid) AS (
      SELECT $1::int UNION
      SELECT l.pid FROM pg_locks l JOIN blocked b ON b.pid = ANY(pg_blocking_pids(l.pid))
      WHERE NOT l.granted
    ) SELECT count(*)::int - 1 AS count FROM blocked`, [pid]);
    if (count >= expected) return;
    await delay(8);
  }
  assert.fail(`Expected ${expected} profile writer(s) blocked on the owner row`);
}

test('private profile and published projections, strict owner and Unicode input', async t => {
  const { db, users: [a, b], request, patch } = await fixture(t);
  const target = '/profiles/' + a;
  assert.equal((await request(-1, target)).status, 401);
  assert.deepEqual((await request(0, '/profile/me')).body, { userId: a, nickname: null, nicknameVisible: false });
  for (const input of [{}, { userId: b, nickname: 'Owned' }, { nickname: null },
    { nickname: ' ' }, { nickname: 'a'.repeat(25) }, { nickname: 'a' + '\u0300'.repeat(110) },
    { nickname: '\ud800' }, { nickname: 'ab\u0000c' }, { nicknameVisible: 'true' }]) {
    assert.equal((await patch(input)).status, 400);
  }
  assert.equal((await request(0, '/profile/me?userId=' + b, { nickname: 'Other' })).status, 400);
  assert.equal((await patch({ nickname: ' Cafe\u0301 ' })).body.nickname, 'Café');
  assert.equal((await patch({ nickname: 'Café' })).status, 200);
  assert.deepEqual((await request(1, target)).body, { userId: a, nickname: null });
  assert.equal((await patch({ nicknameVisible: true })).status, 200);
  assert.deepEqual((await request(1, target)).body, { userId: a, nickname: 'Café' });
  assert.equal(await db.nicknameChange.count({ where: { userId: a } }), 1);
  const family = '👩‍👩‍👦' + 'a'.repeat(23);
  assert.equal((await patch({ nickname: family })).body.nickname, family);
  assert.deepEqual((await request(1, '/profile/me')).body, { userId: b, nickname: null, nicknameVisible: false });
  await db.user.update({ where: { id: a }, data: { webEnabled: false } });
  assert.equal((await request(1, target)).status, 404);
});

test('two distinct changes compete for the final slot and a rejected patch is atomic', async t => {
  const { db, pool, users: [a], request, patch } = await fixture(t);
  for (const nickname of ['First', 'Second']) assert.equal((await patch({ nickname })).status, 200);
  const names = ['Third A', 'Third B'];
  const locker = await pool.connect();
  let pending;
  try {
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [a]);
    pending = Promise.all(names.map(nickname => patch({ nickname })));
    await waitForBlockedWriters(locker, 2);
  } finally {
    await locker.query('ROLLBACK');
    locker.release();
  }
  const results = await pending;
  assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
  const winner = names[results.findIndex(r => r.status === 200)];
  const denied = await patch({ nickname: 'Fourth', nicknameVisible: true });
  assert.equal(denied.body.code, 'NICKNAME_CHANGE_LIMIT');
  assert.deepEqual((await request(0, '/profile/me')).body, { userId: a, nickname: winner, nicknameVisible: false });
  assert.equal((await patch({ nickname: winner, nicknameVisible: true })).status, 200);
  assert.equal(await db.nicknameChange.count({ where: { userId: a } }), 3);
});

test('the 720-hour window advances while a profile patch waits on the owner row', async t => {
  const { db, pool, users: [a], patch } = await fixture(t);
  for (const nickname of ['First', 'Second', 'Third']) assert.equal((await patch({ nickname })).status, 200);
  const locker = await pool.connect();
  let pending;
  try {
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [a]);
    pending = patch({ nickname: 'After the deadline' });
    await waitForBlockedWriters(locker, 1);
    await locker.query(`UPDATE nickname_changes SET changed_at = clock_timestamp() - interval '720 hours' + interval '120 milliseconds'
      WHERE id = (SELECT min(id) FROM nickname_changes WHERE user_id=$1)`, [a]);
    await delay(220);
    await locker.query('COMMIT');
    assert.equal((await pending).status, 200);
    assert.equal(await db.nicknameChange.count({ where: { userId: a } }), 3);
  } finally {
    await locker.query('ROLLBACK');
    locker.release();
    await pending;
  }
});
