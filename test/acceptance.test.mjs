import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';

test('acceptance rolls back a late failure, then commits once under contention', async t => {
  const app = await createApp();
  const database = app.get(DatabaseService), db = database.client;
  let clean = async () => {};
  t.after(async () => { try { await clean(); } finally { await app.close(); } });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  async function post(path, body) {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return { status: r.status, data: await r.json() };
  }
  const capture = (await post('/captures', { originalText: 'Acceptance regression example.' })).data;
  const revision = (await db.captureRevision.findFirstOrThrow({ where: { captureId: capture.id } }));
  const candidate = (await post(`/revisions/${revision.id}/candidates`, {
    candidateNo: 1, englishText: 'I can explain it.', chineseMeaning: '我能解释。',
  })).data;
  clean = async () => {
    await db.$executeRawUnsafe('ALTER TABLE public.learning_records DROP CONSTRAINT IF EXISTS acceptance_test_reject');
    const records = await db.learningRecord.findMany({ where: { candidateId: candidate.id } });
    await db.commandReceipt.deleteMany({ where: { candidateId: candidate.id } });
    await db.learningRecord.deleteMany({ where: { candidateId: candidate.id } });
    for (const row of records) {
      await db.expressionForm.deleteMany({ where: { expressionId: row.expressionId } });
      await db.expression.delete({ where: { id: row.expressionId } });
    }
    await db.candidate.deleteMany({ where: { revisionId: revision.id } });
    await db.captureRevision.deleteMany({ where: { captureId: capture.id } });
    await db.capture.delete({ where: { id: capture.id } });
  };
  // Run against an isolated test database; the temporary constraint targets only this fixture.
  assert.match(candidate.id, /^[0-9a-f-]{36}$/);
  await db.$executeRawUnsafe(`ALTER TABLE public.learning_records
    ADD CONSTRAINT acceptance_test_reject CHECK (candidate_id <> '${candidate.id}'::uuid) NOT VALID`);
  const counts = async () => Promise.all([db.expression.count(), db.expressionForm.count(), db.learningRecord.count()]);
  const before = await counts();
  const path = `/candidates/${candidate.id}/accept`;
  assert.equal((await post(path, { operationId: randomUUID() })).status, 500);
  assert.deepEqual(await counts(), before);
  const afterFailure = await db.candidate.findUniqueOrThrow({ where: { id: candidate.id } });
  assert.equal(afterFailure.status, 'pending');
  assert.equal(afterFailure.acceptedAt, null);
  await db.$executeRawUnsafe('ALTER TABLE public.learning_records DROP CONSTRAINT acceptance_test_reject');
  const results = await Promise.all([post(path, { operationId: randomUUID() }), post(path, { operationId: randomUUID() })]);
  assert.deepEqual(results.map(x => x.status).sort(), [201, 409]);
  const result = results.find(x => x.status === 201).data;
  assert.equal(result.candidate.status, 'accepted');
  assert.equal(result.expression.forms[0].text, candidate.englishText);
  assert.equal(result.learningRecord.candidateId, candidate.id);
  assert.equal('userId' in result.learningRecord, false);
  assert.deepEqual(await counts(), before.map(n => n + 1));
  const saved = await db.learningRecord.findUniqueOrThrow({ where: { candidateId: candidate.id } });
  await assert.rejects(db.learningRecord.create({ data: { ...saved, id: randomUUID() } }),
    error => error.code === 'P2002');
  assert.equal((await post(`/candidates/${candidate.id}/discard`, {})).status, 409);
});
