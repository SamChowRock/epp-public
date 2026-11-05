import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/src/app.js';

test('invalid JSON returns a Problem and does not create a capture', async t => {
  const app = await createApp();
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  const before = await (await fetch(`${baseUrl}/captures`)).json();
  const failure = await fetch(`${baseUrl}/captures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(failure.status, 400);
  assert.match(failure.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.match(failure.headers.get('content-type'), /^application\/problem\+json/);
  assert.equal((await failure.json()).code, 'INVALID_JSON');
  const list = await fetch(`${baseUrl}/captures`, { signal: AbortSignal.timeout(3000) });
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), before);
});
