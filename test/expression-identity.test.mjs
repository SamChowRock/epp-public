import { sessionFetch } from './session-fixture.mjs';
import { removeTestCaptures } from './cleanup.mjs';
import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';

test('identity reuse preserves sources, separates senses, and rolls back mismatched identity', async t => {
  const app = await createApp(), db = app.get(DatabaseService).client;
  const fetch = await sessionFetch(t, app);
  const preservedExpressions = new Set((await db.expression.findMany({ select: { id: true } })).map(row => row.id));
  let capture;
  t.after(async () => {
    try {
      if (capture) await removeTestCaptures(db, [capture.id], preservedExpressions);
    } finally { await app.close(); }
  });
  await app.listen(0, '127.0.0.1');const base = await app.getUrl();
  async function post(path, body) {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  }
  const [norm] = await db.$queryRaw`SELECT public.epp_normalize_v1(E'  TAKE\tA\nBREAK  ') AS folded,
    public.epp_normalize_v1(${ 'cafe\u0301' }) = public.epp_normalize_v1('café') AS nfc,
    public.epp_normalize_v1('Ａ') <> public.epp_normalize_v1('A') AS conservative`;
  assert.deepEqual(norm, { folded: 'take a break', nfc: true, conservative: true });
  capture = (await post('/captures', { originalText: 'Identity integration fixture.' })).body;
  const revision = await db.captureRevision.findFirstOrThrow({ where: { captureId: capture.id } });
  const phrase = 'take a break ' + randomUUID();
  const entries = [['  ' + phrase.toUpperCase().replaceAll(' ', '   ') + '  ', '休息一下'], [phrase, '休息一下'],
    [phrase, '暂停某项活动'], ['Leave this pending.', '保留候选'], ['Discard this.', '放弃候选']];
  const candidates = [];
  for (const [i, [englishText, chineseMeaning]] of entries.entries()) candidates.push((await post(`/revisions/${revision.id}/candidates`, {
    candidateNo: i + 1, englishText, chineseMeaning,
  })).body);
  await post(`/captures/${capture.id}/revisions`, { originalText: 'A newer revision.', chineseIntent: null });
  const operations = candidates.map(() => randomUUID());
  const accept = i => post(`/candidates/${candidates[i].id}/accept`, { operationId: operations[i] });
  const first = await Promise.all([accept(0), accept(1)]);
  assert.deepEqual(first.map(r => r.status), [201, 201]);
  assert.equal(first[0].body.expression.id, first[1].body.expression.id);
  assert.notEqual(first[0].body.learningRecord.id, first[1].body.learningRecord.id);
  assert.equal(first[0].body.learningRecord.candidateId, candidates[0].id);
  assert.equal(first[1].body.learningRecord.candidateId, candidates[1].id);
  assert.equal('semanticKey' in first[0].body.expression, false);
  assert.equal('normalizedText' in first[0].body.expression.forms[0], false);
  assert.deepEqual(await accept(0), first[0]);
  const expression = await db.expression.findUniqueOrThrow({ where: { id: first[0].body.expression.id } });
  // Inject a wrong digest association without changing the original normalized content.
  const [target] = await db.$queryRaw`SELECT public.epp_identity_v1(${phrase}, '暂停某项活动') AS key`;
  await db.expression.update({ where: { id: expression.id }, data: { semanticKey: target.key } });
  try {
    assert.equal((await accept(2)).status, 500);
    assert.equal((await db.candidate.findUniqueOrThrow({ where: { id: candidates[2].id } })).status, 'pending');
    assert.equal(await db.commandReceipt.count({ where: { operationId: operations[2] } }), 0);
  } finally { await db.expression.update({ where: { id: expression.id }, data: { semanticKey: expression.semanticKey } }); }
  const other = await accept(2);assert.equal(other.status, 201);
  assert.notEqual(other.body.expression.id, expression.id);
  assert.equal((await post(`/candidates/${candidates[4].id}/discard`, {})).status, 200);
  assert.equal((await accept(4)).status, 409);
  const states = await db.candidate.findMany({ where: { revisionId: revision.id }, orderBy: { candidateNo: 'asc' } });
  assert.deepEqual(states.map(c => c.status), ['accepted', 'accepted', 'accepted', 'pending', 'discarded']);
  const records = await db.learningRecord.findMany({ where: { candidateId: { in: candidates.map(c => c.id) } } });
  assert.equal(records.length, 3);assert.equal(new Set(records.map(r => r.expressionId)).size, 2);
  const [key] = await db.$queryRaw`SELECT public.epp_identity_v1(${ 'x'.repeat(2000) }, ${ '义'.repeat(2000) }) AS value`;
  assert.equal(key.value.length, 64);
});
