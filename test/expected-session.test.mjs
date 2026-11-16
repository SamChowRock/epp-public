import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { sessionFetch } from './session-fixture.mjs';
import { DatabaseService } from '../dist/src/database.service.js';

test('optional expected session rejects stale pending writes and preserves logout', async t => {
  const app = await createApp(), db = app.get(DatabaseService).client;
  const fetch = await sessionFetch(t, app);
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const identity = await (await fetch(base + '/auth/me')).json();
  assert.equal((await fetch(base + '/auth/me', { headers: { 'X-Expected-Session': identity.sessionId } })).status, 200);
  const before = await db.capture.count();
  const key = randomUUID();
  const stale = await fetch(base + '/captures', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Expected-Session': randomUUID(),
  }, body: JSON.stringify({ originalText: 'must not cross sessions' }) });
  assert.equal(stale.status, 401);
  assert.equal((await stale.json()).code, 'SESSION_CHANGED');
  assert.equal(await db.capture.count(), before);
  assert.equal(await db.captureWriteReceipt.count({ where: { operationId: key } }), 0);
  assert.equal((await fetch(base + '/auth/me')).status, 200);
  const logout = await fetch(base + '/auth/logout', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Expected-Session': randomUUID(),
  }, body: '{}' });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(base + '/auth/me')).status, 401);
});
