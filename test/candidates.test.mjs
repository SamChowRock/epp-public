import test from 'node:test';
import assert from 'node:assert/strict';
import { CreateCandidateSchema, CandidateResponseSchema } from '../dist/src/candidate-contract.js';

test('candidate input and terminal state preserve the confirmation contract', () => {
  const content = { candidateNo: 1, englishText: "I'm not much of a cook.", chineseMeaning: '我不太会做饭。' };
  assert.deepEqual(CreateCandidateSchema.parse(content), content);
  for (const change of [{ candidateNo: 6 }, { englishText: '\u0000' }, { englishText: '\ud800' },
    { englishText: '😀'.repeat(1001) }, { chineseMeaning: ' ' }, { status: 'accepted' }]) {
    assert.equal(CreateCandidateSchema.safeParse({ ...content, ...change }).success, false);
  }
  const row = { ...content, id: '10000000-0000-4000-8000-000000000001',
    revisionId: '20000000-0000-4000-8000-000000000002', createdAt: '2026-11-03T00:00:00.000Z',
    status: 'pending', discardedAt: null };
  assert.equal(CandidateResponseSchema.safeParse(row).success, true);
  assert.equal(CandidateResponseSchema.safeParse({ ...row, status: 'discarded' }).success, false);
  assert.equal(CandidateResponseSchema.safeParse({ ...row, status: 'discarded', discardedAt: row.createdAt }).success, true);
  assert.equal(CandidateResponseSchema.safeParse({ ...row, status: 'accepted' }).success, false);
});
