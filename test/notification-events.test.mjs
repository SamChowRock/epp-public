import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { ApplicationState } from '../dist/src/application-state.js';
import { issueToken, tokenDigest } from '../dist/src/token.js';

async function fixture(t) {
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const db = app.get(DatabaseService).client;
  const users = [randomUUID(), randomUUID()];
  const streams = new Set();
  t.after(async () => {
    for (const abort of streams) abort.abort();
    app.get(ApplicationState).beginDrain();
    await app.get(ApplicationState).whenIdle();
    try {
      await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    }
    finally { await app.close(); }
  });
  const sessions = [];
  for (const userId of users) {
    const token = issueToken(), id = randomUUID();
    await db.user.create({ data: { id: userId, webEnabled: true } });
    await db.session.create({ data: { id, userId, tokenDigest: tokenDigest(token),
      label: 'SSE test', expiresAt: new Date(Date.now() + 3600000) } });
    sessions.push({ id, cookie: 'epp_session=' + token });
  }
  const url = await app.getUrl() + '/notifications/events';
  async function open(index = 0) {
    const abort = new AbortController();
    streams.add(abort);
    const response = await fetch(url, { headers: { Cookie: sessions[index].cookie },
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(40000)]) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = '';
    async function frame() {
      while (!buffered.includes('\n\n')) {
        const chunk = await reader.read();
        if (chunk.done) { assert.equal(buffered, ''); return null; }
        buffered += chunk.value;
      }
      const end = buffered.indexOf('\n\n');
      const result = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      return result;
    }
    assert.equal(await frame(), 'event: inbox\ndata: refresh');
    return { abort, frame };
  }
  return { app, db, users, sessions, url, open };
}

test('inbox stream validates the boundary and releases its per-user slots on close and drain', async t => {
  const { app, sessions, url, open } = await fixture(t);
  const cookie = { Cookie: sessions[0].cookie };
  for (const [address, headers, status] of [
    [url, {}, 401], [url + '?userId=foreign', cookie, 400],
    [url, { ...cookie, Origin: 'https://foreign.example' }, 403],
    [url, { ...cookie, 'Sec-Fetch-Site': 'same-site' }, 403],
  ]) {
    const res = await fetch(address, { headers });
    assert.equal(res.status, status);
    await res.body.cancel();
  }
  const connections = await Promise.all(Array.from({ length: 4 }, () => open()));
  const excess = await fetch(url, { headers: cookie });
  assert.equal(excess.status, 429);
  assert.equal((await excess.json()).code, 'STREAM_LIMIT');
  connections.pop().abort.abort();
  // Wait for the server to see the socket close before reclaiming its slot.
  let replacement;
  for (let i = 0; i < 20 && !replacement; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    try { replacement = await open(); } catch (error) {
      if (error.actual !== 429) throw error;
    }
  }
  assert.ok(replacement);
  connections.push(replacement, await open(1));
  app.get(ApplicationState).beginDrain();
  for (const connection of connections) assert.equal(await connection.frame(), null);
});

test('only a changed owned visible page produces a hint; heartbeat is a comment and session loss closes the stream', async t => {
  const { db, users, sessions, open } = await fixture(t);
  const [a, b] = await Promise.all([open(0), open(1)]);
  const id = randomUUID();
  await db.notification.create({ data: { id, userId: users[0], kind: 'registered' } });
  const hint = 'event: inbox\ndata: refresh';
  assert.equal(await a.frame(), hint);
  await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  assert.equal(await a.frame(), hint);
  await db.notification.update({ where: { id }, data: { clearedAt: new Date() } });
  assert.equal(await a.frame(), hint);
  assert.equal(await b.frame(), ': heartbeat');
  await db.session.delete({ where: { id: sessions[0].id } });
  await db.session.update({ where: { id: sessions[1].id }, data: {
    createdAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() - 1000),
  } });
  assert.equal(await a.frame(), null);
  assert.equal(await b.frame(), null);
});

test('existing streams close when an account is disabled or loses Web access', async t => {
  const { db, users, open } = await fixture(t);
  const [a, b] = await Promise.all([open(0), open(1)]);
  await db.user.update({ where: { id: users[0] }, data: { status: 'disabled' } });
  await db.user.update({ where: { id: users[1] }, data: { webEnabled: false } });
  assert.equal(await a.frame(), null);
  assert.equal(await b.frame(), null);
});

test('a late commit in second place and a change in next-page availability each invalidate the displayed page', async t => {
  const { app, db, users: [userId], open } = await fixture(t);
  const hint = 'event: inbox\ndata: refresh';
  // Hold the earlier insert in its own transaction while a second connection commits.
  const earlier = randomUUID(), later = randomUUID();
  const pending = await app.get(DatabaseService).pool.connect();
  let stream;
  try {
    await pending.query('BEGIN');
    await pending.query(`INSERT INTO public.notifications(id,user_id,kind,created_at)
      VALUES ($1,$2,'registered',clock_timestamp() - interval '1 second')`, [earlier, userId]);
    await db.notification.create({ data: { id: later, userId, kind: 'password-reset' } });
    stream = await open();
    assert.equal(await db.notification.count({ where: { userId } }), 1);
    await pending.query('COMMIT');
  } finally {
    await pending.query('ROLLBACK');
    pending.release();
  }
  assert.equal(await stream.frame(), hint);
  const order = [{ createdAt: 'desc' }, { id: 'desc' }];
  assert.deepEqual((await db.notification.findMany({ where: { userId }, orderBy: order })).map(n => n.id), [later, earlier]);

  const older = Array.from({ length: 19 }, (_, i) => ({ id: randomUUID(), userId, kind: 'registered',
    createdAt: new Date(Date.now() - 60000 - i * 1000) }));
  await db.notification.createMany({ data: older });
  assert.equal(await stream.frame(), hint);
  const readPage = () => db.notification.findMany({ where: { userId, clearedAt: null }, orderBy: order, take: 20 });
  const firstTwenty = await readPage();
  await db.notification.update({ where: { id: older.at(-1).id }, data: { clearedAt: new Date() } });
  assert.deepEqual(await readPage(), firstTwenty);
  assert.equal(await stream.frame(), hint);
});
