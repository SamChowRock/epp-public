import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';

test('one operation replays, rejects changed intent, and rolls back when receipt storage fails', async t => {
  const app = await createApp();
  const db = app.get(DatabaseService).client;
  let capture, revision;
  t.after(async () => {
    try {
      await db.$executeRawUnsafe('ALTER TABLE command_receipts DROP CONSTRAINT IF EXISTS receipt_test_reject');
      if (revision) {
        const candidates = await db.candidate.findMany({ where: { revisionId: revision.id } });
        const ids = candidates.map(x => x.id);
        const records = await db.learningRecord.findMany({ where: { candidateId: { in: ids } } });
        await db.commandReceipt.deleteMany({ where: { candidateId: { in: ids } } });
        await db.learningRecord.deleteMany({ where: { candidateId: { in: ids } } });
        for (const expressionId of new Set(records.map(row => row.expressionId))) {
          await db.expressionForm.deleteMany({ where: { expressionId } });
          await db.expression.delete({ where: { id: expressionId } });
        }
        await db.candidate.deleteMany({ where: { revisionId: revision.id } });
        await db.captureRevision.deleteMany({ where: { captureId: capture.id } });
      }
      if (capture) await db.capture.delete({ where: { id: capture.id } });
    } finally { await app.close(); }
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  async function post(path, body) {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return { status: r.status, body: await r.json() };
  }
  capture = (await post('/captures', { originalText: 'Saved operation identity.' })).body;
  revision = await db.captureRevision.findFirstOrThrow({ where: { captureId: capture.id } });
  const candidates = [];
  for (let candidateNo = 1; candidateNo <= 3; candidateNo++) candidates.push((await post(`/revisions/${revision.id}/candidates`, {
    candidateNo, englishText: 'Keep the same identity.', chineseMeaning: '保留相同身份。',
  })).body);
  const path = `/candidates/${candidates[0].id}/accept`, operationId = randomUUID();
  for (const body of [{}, { operationId: 'bad' }, { operationId, force: true }, { operationId: operationId.toUpperCase() }]) {
    assert.equal((await post(path, body)).status, 400);
  }
  const counts = () => Promise.all([db.expression.count(), db.expressionForm.count(), db.learningRecord.count(), db.commandReceipt.count()]);
  const before = await counts();
  await db.$executeRawUnsafe(`ALTER TABLE command_receipts ADD CONSTRAINT receipt_test_reject
    CHECK (operation_id <> '${operationId}'::uuid) NOT VALID`);
  assert.equal((await post(path, { operationId })).status, 500);
  assert.deepEqual(await counts(), before);
  assert.equal((await db.candidate.findUniqueOrThrow({ where: { id: candidates[0].id } })).status, 'pending');
  await db.$executeRawUnsafe('ALTER TABLE command_receipts DROP CONSTRAINT receipt_test_reject');
  const results = await Promise.all([post(path, { operationId }), post(path, { operationId })]);
  assert.deepEqual(results.map(r => r.status), [201, 201]);
  assert.deepEqual(results[0].body, results[1].body);
  assert.deepEqual(await counts(), before.map(n => n + 1));
  const replay = await post(path, { operationId });
  assert.deepEqual(replay, results[0]);
  const changed = await post(`/candidates/${candidates[1].id}/accept`, { operationId });
  assert.equal(changed.status, 409);assert.equal(changed.body.code, 'OPERATION_CONFLICT');
  assert.equal((await db.candidate.findUniqueOrThrow({ where: { id: candidates[1].id } })).status, 'pending');
  const other = await post(path, { operationId: randomUUID() });
  assert.equal(other.status, 409);assert.equal(other.body.code, 'CANDIDATE_CONFLICT');
  assert.equal((await post(`/candidates/${randomUUID()}/accept`, { operationId })).status, 404);
  // A former chapter's success has no command identity; never fabricate one from candidateId.
  const legacyPath = `/candidates/${candidates[2].id}/accept`, legacyOperation = randomUUID();
  assert.equal((await post(legacyPath, { operationId: legacyOperation })).status, 201);
  await db.commandReceipt.deleteMany({ where: { operationId: legacyOperation } });
  assert.equal((await post(legacyPath, { operationId: legacyOperation })).status, 409);
  assert.equal(await db.commandReceipt.count({ where: { operationId: legacyOperation } }), 0);
  // Receipts do not bypass current ownership, even for a known operation.
  const userId = randomUUID();await db.user.create({ data: { id: userId } });
  try {
    await db.capture.update({ where: { id: capture.id }, data: { userId } });
    assert.equal((await post(path, { operationId })).status, 404);
  } finally {
    await db.capture.update({ where: { id: capture.id }, data: { userId: '10000000-0000-4000-8000-000000000001' } });
    await db.user.delete({ where: { id: userId } });
  }
});
