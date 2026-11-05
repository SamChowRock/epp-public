import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { removeTestCaptures } from './cleanup.mjs';

test('fixture cleanup preserves an existing expression and its original source after reuse', async t => {
  const app = await createApp(), db = app.get(DatabaseService).client;
  const originalExpressions = new Set((await db.expression.findMany({ select: { id: true } })).map(row => row.id));
  const captures = [];
  t.after(async () => {
    try { await removeTestCaptures(db, captures, originalExpressions); }
    finally { await app.close(); }
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(), englishText = 'Shared cleanup fixture ' + randomUUID();
  async function post(path, body) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    assert.equal(response.status, 201);
    return response.json();
  }
  async function acceptSource() {
    const capture = await post('/captures', { originalText: englishText });
    captures.push(capture.id);
    const revision = await db.captureRevision.findFirstOrThrow({ where: { captureId: capture.id } });
    const candidate = await post(`/revisions/${revision.id}/candidates`, {
      candidateNo: 1, englishText, chineseMeaning: '保留共享表达及其来源',
    });
    return post(`/candidates/${candidate.id}/accept`, { operationId: randomUUID() });
  }
  const existing = await acceptSource();
  const snapshot = () => db.expression.findUniqueOrThrow({ where: { id: existing.expression.id },
    include: { forms: true, learningRecords: true } });
  const before = await snapshot();
  const receipt = await db.commandReceipt.findFirstOrThrow({ where: { candidateId: existing.candidate.id } });
  const preserved = new Set([...originalExpressions, existing.expression.id]);
  const reused = await acceptSource();
  assert.equal(reused.expression.id, existing.expression.id);
  await removeTestCaptures(db, [captures[1]], preserved);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await db.commandReceipt.findFirstOrThrow({ where: { candidateId: existing.candidate.id } }), receipt);
  assert.equal(await db.capture.count({ where: { id: captures[1] } }), 0);
  assert.equal(await db.candidate.count({ where: { id: reused.candidate.id } }), 0);
  assert.equal(await db.commandReceipt.count({ where: { candidateId: reused.candidate.id } }), 0);
});
