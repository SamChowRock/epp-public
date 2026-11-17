import './auth-rate-test-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { RECOVERY_PATHS } from '../dist/src/recovery-contract.js';

test('registration and recovery share the same durable source budget as login and password changes', async t => {
  const app = await createApp();
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const paths = ['/auth/login', '/auth/password', ...RECOVERY_PATHS];
  const send = path => fetch(base + path, { method: 'POST',
    headers: { 'X-EPP-Request': '1', 'content-type': 'application/json' }, body: '{}' });
  // Body/session failures occur after the quota middleware and consume one slot.
  for (let n = 0; n < 10; n++) {
    const result = await send(paths[n % paths.length]);
    assert.notEqual(result.status, 429);
    assert(result.status >= 400 && result.status < 500);
    await result.arrayBuffer();
  }
  for (const path of paths) {
    const result = await send(path);
    assert.equal(result.status, 429, path);
    assert.equal((await result.json()).code, 'AUTH_RATE_LIMIT');
    assert(Number(result.headers.get('Retry-After')) > 0);
  }
  const rows = await app.get(DatabaseService).client.authRateBucket.findMany({ where: { ruleKey: 'password-auth/v1' } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].used, 10);
});
