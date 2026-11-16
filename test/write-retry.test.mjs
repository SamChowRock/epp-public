import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';

test('capture write identities replay original results and reject changed inputs', async t => {
  const app = await createApp();
  const db = app.get(DatabaseService).client;
  const ids = new Set();
  t.after(async () => {
    try {
      if (db.captureWriteReceipt) await db.captureWriteReceipt.deleteMany({ where: { captureId: { in: [...ids] } } });
      await db.captureRevision.deleteMany({ where: { captureId: { in: [...ids] } } });
      await db.capture.deleteMany({ where: { id: { in: [...ids] } } });
    } finally { await app.close(); }
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  async function post(path, body, key) {
    const r = await fetch(base + path, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(key === undefined ? {} : { 'Idempotency-Key': key }),
    }, body: JSON.stringify(body) });
    const data = await r.json();
    if (path === '/captures' && r.status === 201) ids.add(data.id);
    return { status: r.status, location: r.headers.get('Location'), data };
  }
  const key = randomUUID(), input = { originalText: ' Write once. ' };
  const [a, b] = await Promise.all([post('/captures', input, key), post('/captures', input, key)]);
  assert.equal(a.status, 201); assert.deepEqual(a, b);
  assert.equal((await post('/captures', { ...input, chineseIntent: null }, key)).data.id, a.data.id);
  assert.equal((await post('/captures', { originalText: 'changed' }, key)).status, 409);
  const path = `/captures/${a.data.id}/revisions`, revisionKey = randomUUID();
  const revision = { originalText: 'second', chineseIntent: null };
  const [r1, r2] = await Promise.all([post(path, revision, revisionKey), post(path, revision, revisionKey)]);
  assert.equal(r1.status, 201); assert.deepEqual(r1, r2);
  await post(path, { ...revision, originalText: 'third' }, randomUUID());
  assert.deepEqual(await post(path, revision, revisionKey), r1);
  assert.equal((await post(path, { ...revision, originalText: 'changed' }, revisionKey)).status, 409);
  assert.equal((await post('/captures', input, 'evil-key')).status, 400);
  assert.equal((await post('/captures', input, key.toUpperCase())).status, 400);
  const unkeyed1 = await post('/captures', input), unkeyed2 = await post('/captures', input);
  assert.notEqual(unkeyed1.data.id, unkeyed2.data.id);
});

test('write receipts isolate users, recheck ownership, and roll back failed receipts', async t => {
  const { CaptureCommands } = await import('../dist/src/capture-commands.js');
  const { ApplicationState } = await import('../dist/src/application-state.js');
  const app = await createApp();
  await app.init();
  const database = app.get(DatabaseService), db = database.client;
  const userA = randomUUID(), userB = randomUUID();
  await db.user.createMany({ data: [{ id: userA }, { id: userB }] });
  const a = new CaptureCommands(database, new ApplicationState(), userA);
  const b = new CaptureCommands(database, new ApplicationState(), userB);
  t.after(async () => {
    try {
      await db.$executeRawUnsafe('ALTER TABLE public.capture_write_receipts DROP CONSTRAINT IF EXISTS write_retry_test_reject');
      const captures = await db.capture.findMany({ where: { userId: { in: [userA, userB] } }, select: { id: true } });
      const ids = captures.map(c => c.id);
      await db.captureWriteReceipt.deleteMany({ where: { userId: { in: [userA, userB] } } });
      await db.captureRevision.deleteMany({ where: { captureId: { in: ids } } });
      await db.capture.deleteMany({ where: { id: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    } finally { await app.close(); }
  });
  const key = randomUUID(), input = { originalText: 'User scoped write' };
  const ca = await a.create(key, input), cb = await b.create(key, input);
  assert.notEqual(ca.id, cb.id);
  const revisionInput = { originalText: 'edit', chineseIntent: null };
  await assert.rejects(b.appendRevision(ca.id, randomUUID(), revisionInput), { constructor: (await import('../dist/src/captures.service.js')).CaptureNotFoundError });
  const revisionKey = randomUUID();
  const original = await a.appendRevision(ca.id, revisionKey, revisionInput);
  await db.capture.update({ where: { id: ca.id }, data: { userId: userB } });
  await assert.rejects(a.create(key, input), /Capture not found/);
  await assert.rejects(a.appendRevision(ca.id, revisionKey, revisionInput), /Capture not found/);
  await db.capture.update({ where: { id: ca.id }, data: { userId: userA } });
  assert.deepEqual(await a.appendRevision(ca.id, revisionKey, revisionInput), original);
  const failKey = randomUUID();
  await db.$executeRawUnsafe(`ALTER TABLE public.capture_write_receipts ADD CONSTRAINT write_retry_test_reject
    CHECK (operation_id <> '${failKey}'::uuid) NOT VALID`);
  const before = await db.capture.count({ where: { userId: userA } });
  await assert.rejects(a.create(failKey, { originalText: 'rollback' }));
  assert.equal(await db.capture.count({ where: { userId: userA } }), before);
  const revisionCount = await db.captureRevision.count({ where: { captureId: ca.id } });
  await assert.rejects(a.appendRevision(ca.id, failKey, revisionInput));
  assert.equal(await db.captureRevision.count({ where: { captureId: ca.id } }), revisionCount);
  assert.equal(await db.captureWriteReceipt.count({ where: { operationId: failKey } }), 0);
  await db.$executeRawUnsafe('ALTER TABLE public.capture_write_receipts DROP CONSTRAINT write_retry_test_reject');
  const recovered = await a.create(failKey, { originalText: 'rollback' });
  assert.deepEqual(await a.create(failKey, { originalText: 'rollback' }), recovered);
  await db.captureWriteReceipt.update({ where: { userId_action_operationId: {
    userId: userA, action: 'create-capture/v1', operationId: failKey,
  } }, data: { response: { invalid: true } } });
  await assert.rejects(a.create(failKey, { originalText: 'rollback' }));
  assert.equal(await db.capture.count({ where: { userId: userA } }), before + 1);
});

test('different operation keys competing for one revision keep the revision conflict', async t => {
  const { CaptureCommands } = await import('../dist/src/capture-commands.js');
  const { ApplicationState } = await import('../dist/src/application-state.js');
  const app = await createApp(); await app.init();
  const database = app.get(DatabaseService), db = database.client;
  const user = randomUUID();
  await db.user.create({ data: { id: user } });
  const commands = new CaptureCommands(database, new ApplicationState(), user);
  const capture = await commands.create(randomUUID(), { originalText: 'Contention fixture' });
  const gate = await database.pool.connect();
  const gateKey = 303001;
  t.after(async () => {
    try {
      await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]); gate.release();
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS write_retry_gate ON public.capture_revisions');
      await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS public.write_retry_gate_fn()');
      await db.captureWriteReceipt.deleteMany({ where: { userId: user } });
      await db.captureRevision.deleteMany({ where: { captureId: capture.id } });
      await db.capture.delete({ where: { id: capture.id } });
      await db.user.delete({ where: { id: user } });
    } finally { await app.close(); }
  });
  await db.$executeRawUnsafe(`CREATE FUNCTION public.write_retry_gate_fn() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.capture_id = '${capture.id}'::uuid THEN
      PERFORM pg_advisory_xact_lock_shared(${gateKey}); END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER write_retry_gate BEFORE INSERT ON public.capture_revisions FOR EACH ROW EXECUTE FUNCTION public.write_retry_gate_fn()');
  await gate.query('SELECT pg_advisory_lock($1)', [gateKey]);
  const promises = [randomUUID(), randomUUID()].map(key => commands.appendRevision(capture.id, key,
    { originalText: 'concurrent edit', chineseIntent: null }).then(value => ({ value }), error => ({ error })));
  const deadline = Date.now() + 800;
  let waiting = 0;
  while (Date.now() < deadline) {
    const result = await gate.query("SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%INSERT INTO public.capture_revisions%'");
    waiting = result.rows[0].n;
    if (waiting === 2) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]);
  const results = await Promise.all(promises);
  assert.equal(waiting, 2, 'both INSERT snapshots must be waiting at the test gate');
  assert.equal(results.filter(r => r.value).length, 1);
  assert.equal(results.find(r => r.error).error.constructor.name, 'RevisionConflictError');
  assert.equal(await db.captureRevision.count({ where: { captureId: capture.id } }), 2);
  assert.equal(await db.captureWriteReceipt.count({ where: { userId: user, action: 'append-revision/v1' } }), 1);
});
