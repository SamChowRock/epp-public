import './auth-rate-test-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';

test('two API instances share the ten attempts before body parsing', async t => {
  const apps = [await createApp(), await createApp()];
  t.after(async () => { for (const app of apps) await app.close(); });
  for (const app of apps) await app.listen(0, '127.0.0.1');
  const urls = await Promise.all(apps.map(app => app.getUrl()));
  for (let i = 0; i < 11; i++) {
    const response = await fetch(urls[i % 2] + '/auth/login', { method: 'POST',
      headers: { 'X-EPP-Request': '1', 'content-type': 'application/json' }, body: '{' });
    assert.equal(response.status, i < 10 ? 400 : 429);
  }
});

import pg from 'pg';
import { SharedAuthRateLimiter, AUTH_RATE_RULE } from '../dist/src/shared-auth-rate-limiter.js';
import { ApplicationState } from '../dist/src/application-state.js';

async function fixture(t) {
  const app = await createApp(); const database = app.get(DatabaseService);
  t.after(() => app.close());
  return { app, db: database.client, pool: database.pool,
    limiter: new SharedAuthRateLimiter(database, new ApplicationState()) };
}
test('parallel first use and final slot are atomic; rejection does not increment or extend', async t => {
  const { db, limiter } = await fixture(t);
  const first = await Promise.all(Array.from({ length: 10 }, () => limiter.consume('first')));
  assert(first.every(x => x.allowed));
  const before = await db.authRateBucket.findFirst();
  const refused = await limiter.consume('first');
  assert.equal(refused.allowed, false); assert(refused.retryAfter >= 1 && refused.retryAfter <= 60);
  assert.deepEqual(await db.authRateBucket.findFirst(), before);
  for (let i = 0; i < 9; i++) await limiter.consume('last');
  const last = await Promise.all([limiter.consume('last'), limiter.consume('last')]);
  assert.deepEqual(last.map(x => x.allowed).sort(), [false, true]);
});
test('capacity 999 concurrent newcomers wait for the rule lock and cannot create row 1001', async t => {
  const { db, pool, limiter } = await fixture(t);
  await db.$executeRaw`INSERT INTO public.auth_rate_buckets SELECT 'password-auth/v1', 'seed-' || i,
    now, now + interval '60 seconds', 1
    FROM generate_series(1,999) i CROSS JOIN (SELECT date_trunc('milliseconds',clock_timestamp()) now) clock`;
  const lock = await pool.connect();
  try {
    await lock.query('BEGIN'); await lock.query('SELECT pg_advisory_xact_lock(4542544,41)');
    const pending = Promise.all([limiter.consume('new-a'), limiter.consume('new-b')]);
    await new Promise(resolve => setTimeout(resolve, 100));
    await lock.query('COMMIT');
    assert.deepEqual((await pending).map(x => x.allowed).sort(), [false, true]);
    assert.equal(await db.authRateBucket.count(), 1000);
    assert.equal((await limiter.consume('seed-1')).allowed, true);
  } finally { await lock.query('ROLLBACK'); lock.release(); }
});
test('one call deletes at most 100 expired rows; current expired row can reopen without eviction', async t => {
  const { db, limiter } = await fixture(t);
  await db.$executeRaw`INSERT INTO public.auth_rate_buckets SELECT 'password-auth/v1', 'expired-' || i,
    '2000-01-01'::timestamptz, '2000-01-01 00:01'::timestamptz, 10 FROM generate_series(1,1000) i`;
  assert.equal((await limiter.consume('fresh')).allowed, true);
  assert.equal(await db.authRateBucket.count(), 901);
  assert.equal((await limiter.consume('expired-999')).allowed, true);
  const reopened = await db.authRateBucket.findUnique({ where: { ruleKey_sourceKey: { ruleKey: AUTH_RATE_RULE, sourceKey: 'expired-999' } } });
  assert.equal(reopened.used, 1); assert.equal(reopened.expiresAt - reopened.openedAt, 60000);
});
test('waiting consumer uses database time after lock acquisition rather than transaction or API time', async t => {
  const { db, pool, limiter } = await fixture(t);
  await db.$executeRaw`INSERT INTO public.auth_rate_buckets SELECT 'password-auth/v1','expires',
    now - interval '59.7 seconds',
    now + interval '0.3 seconds',10 FROM (SELECT date_trunc('milliseconds',clock_timestamp()) now) clock`;
  const lock = await pool.connect();
  try {
    await lock.query('BEGIN'); await lock.query('SELECT pg_advisory_xact_lock(4542544,41)');
    const pending = limiter.consume('expires');
    await new Promise(resolve => setTimeout(resolve, 450)); await lock.query('COMMIT');
    assert.equal((await pending).allowed, true);
    const [{ opened_at, db_now }] = (await pool.query("SELECT opened_at, clock_timestamp() db_now FROM auth_rate_buckets WHERE source_key='expires'")).rows;
    assert(db_now - opened_at < 250);
  } finally { await lock.query('ROLLBACK'); lock.release(); }
});
test('quota storage failure returns 503 before body, ordinary session read stays 200, drain remains distinct', async t => {
  const { app, db, pool } = await fixture(t);
  const { randomUUID } = await import('node:crypto');
  const { issueToken, tokenDigest } = await import('../dist/src/token.js');
  const id = randomUUID(), token = issueToken();
  await db.user.create({ data: { id, webEnabled: true, sessions: { create: { id: randomUUID(), label: 'Quota test', tokenDigest: tokenDigest(token), expiresAt: new Date(Date.now() + 60000) } } } });
  t.after(async () => { const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect(); try { await client.query('DELETE FROM sessions WHERE user_id=$1', [id]); await client.query('DELETE FROM users WHERE id=$1', [id]); } finally { await client.end(); } });
  await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
  // Rename preserves all existing data while forcing a genuine missing-table failure.
  await pool.query('ALTER TABLE auth_rate_buckets RENAME TO auth_rate_buckets_unavailable');
  try {
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'X-EPP-Request': '1', 'content-type': 'application/json' }, body: '{' });
    assert.equal(response.status, 503); assert.equal((await response.json()).code, 'AUTH_RATE_UNAVAILABLE');
    assert.equal(response.headers.get('connection'), 'close'); assert(response.headers.get('x-request-id'));
    assert.equal((await fetch(base + '/auth/me', { headers: { Cookie: 'epp_session=' + token } })).status, 200);
  } finally { await pool.query('ALTER TABLE auth_rate_buckets_unavailable RENAME TO auth_rate_buckets'); }
  app.get(ApplicationState).beginDrain();
  const draining = await fetch(base + '/auth/login', { method: 'POST', headers: { 'X-EPP-Request': '1' } });
  assert.equal((await draining.json()).code, 'SERVICE_DRAINING');
});
