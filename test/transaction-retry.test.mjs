import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '../dist/src/generated/prisma/client.js';
import { PrismaCandidateStore } from '../dist/src/prisma-candidate.store.js';
import { databaseFailure } from '../dist/src/database-errors.js';
const failure = code => new Prisma.PrismaClientKnownRequestError('Synthetic database failure', {
  code, clientVersion: '7.10.1',
});
test('acceptance retries known rollbacks only, with a finite budget', async () => {
  assert.deepEqual(databaseFailure({ code: 'P2039', meta: { driverAdapterError: {
    cause: { originalCode: '55P03' },
  } } }), { code: '55P03', unavailable: true });
  for (const [code, failures, expectedCalls, succeeds] of [
    ['P2034', 2, 3, true], ['P2034', 9, 3, false],
    ['P2002', 1, 1, false], ['P2028', 1, 1, false], ['P1017', 1, 1, false],
  ]) {
    let calls = 0;
    const store = new PrismaCandidateStore({ run: (_operation, work) => work(),
      client: { $transaction: async () => { if (++calls <= failures) throw failure(code); return 'conflict'; } } });
    const result = store.accept('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002');
    if (succeeds) assert.equal(await result, 'conflict');
    else await assert.rejects(result, error => error.code === code);
    assert.equal(calls, expectedCalls, code);
  }
});
