import './auth-rate-test-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { sessionFetch } from './session-fixture.mjs';
import { DatabaseService } from '../dist/src/database.service.js';

test('keyed HTTP writes remain scoped to current account permission and live session', async t => {
  const app = await createApp(), db = app.get(DatabaseService).client;
  const users = [randomUUID(), randomUUID()];
  await db.user.createMany({ data: users.map(id => ({ id, webEnabled: true })) });
  const a = await sessionFetch(t, app, users[0]), b = await sessionFetch(t, app, users[1]);
  t.after(async () => {
    try {
      await db.captureWriteReceipt.deleteMany({ where: { userId: { in: users } } });
      await db.captureRevision.deleteMany({ where: { capture: { userId: { in: users } } } });
      await db.capture.deleteMany({ where: { userId: { in: users } } });
      await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    } finally { await app.close(); }
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(), key = randomUUID();
  const post = (request, path, input, operation = key) => request(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operation },
    body: JSON.stringify(input),
  });
  const input = { originalText: 'two actual session owners' };
  const first = await post(a, '/captures', input); assert.equal(first.status, 201);
  const firstBody = await first.json();
  const other = await post(b, '/captures', input); assert.equal(other.status, 201);
  assert.notEqual((await other.json()).id, firstBody.id);
  assert.equal((await post(b, `/captures/${firstBody.id}/revisions`, { originalText: 'foreign', chineseIntent: null })).status, 404);
  await db.user.update({ where: { id: users[0] }, data: { webEnabled: false } });
  assert.equal((await post(a, '/captures', input)).status, 403);
  assert.equal(await db.capture.count({ where: { userId: users[0] } }), 1);
  await db.user.update({ where: { id: users[0] }, data: { webEnabled: true } });
  const replay = await post(a, '/captures', input); assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), firstBody);
  assert.equal(replay.headers.get('location'), first.headers.get('location'));
  assert.equal((await post(a, '/auth/logout', {})).status, 204);
  assert.equal((await post(a, '/captures', input)).status, 401);
  assert.equal(await db.captureWriteReceipt.count({ where: { userId: users[0] } }), 1);
});
