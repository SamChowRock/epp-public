import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { withVerifiedDatabase } from './verify-database.mjs';

const [directory, expected] = process.argv.slice(2);
if (!directory || !expected)
  throw Error('Usage: node scripts/check-runtime.mjs RELEASE EXPECTED_DATABASE');
const user = '10000000-0000-4000-8000-000000000001';
const port = process.env.EPP_CHECK_PORT ?? '3354';
const origin = 'http://127.0.0.1:' + port;
const env = {
  PATH: process.env.PATH,
  NODE_ENV: 'production',
  DATABASE_URL: process.env.DATABASE_URL,
};
const options = { cwd: directory, env };
const runNode = promisify(execFile);

// This fixture belongs to the empty database just bootstrapped by check-delivery.sh.
await withVerifiedDatabase(expected, async (client) => {
  const { rows } = await client.query(`SELECT EXISTS(SELECT FROM public.users)
    OR EXISTS(SELECT FROM public.verification_outbox) OR EXISTS(SELECT FROM public.notification_jobs) AS occupied`);
  assert.equal(rows[0].occupied, false, 'Delivery check requires a fresh fixture database');
  await client.query('INSERT INTO public.users(id, web_enabled) VALUES ($1, true)', [user]);
});

async function exercise(args, extra, ready, inspect = async () => {}) {
  const child = spawn(process.execPath, args, {
    ...options,
    env: { ...env, ...extra },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const closed = once(child, 'exit');
  const reader = createInterface({ input: child.stdout });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 15000);
  try {
    let observed = false;
    for await (const line of reader) {
      if (JSON.parse(line).message?.event === ready) {
        observed = true;
        break;
      }
    }
    assert.ok(observed, 'Missing ' + ready + ' for ' + args.join(' '));
    await inspect();
  } finally {
    reader.close();
    child.kill('SIGTERM');
    try {
      const [code, signal] = await closed;
      assert.equal(code, 0, 'Unexpected shutdown: ' + (signal ?? code));
    } finally {
      clearTimeout(deadline);
    }
  }
  console.log(args.join(' '), ready, 'and graceful exit');
}

await exercise(
  ['dist/src/server.js'],
  {
    PORT: port,
    APP_ORIGIN: origin,
    CURSOR_HMAC_KEY: randomBytes(32).toString('hex'),
  },
  'app.ready',
  async () => {
    const me = await fetch(origin + '/profile/me', { signal: AbortSignal.timeout(3000) });
    assert.equal(me.status, 401);
    assert.equal((await me.json()).code, 'AUTH_REQUIRED');
    const docs = await fetch(origin + '/docs', { signal: AbortSignal.timeout(3000) });
    assert.equal(docs.status, 404);
  },
);
for (const role of [[], ['notifications']]) {
  await exercise(['dist/src/mail-worker.js', expected, ...role], {}, 'worker.ready');
}
const { stdout } = await runNode(
  process.execPath,
  ['dist/src/account-admin.js', expected, 'preview', user, 'off'],
  { ...options, timeout: 10000 },
);
const result = JSON.parse(stdout);
assert.equal(result.database, expected);
assert.equal(result.userId, user);
assert.equal(result.result, 'preview');
assert.equal(result.before.webEnabled, true);
assert.equal(result.after.webEnabled, false);
await withVerifiedDatabase(expected, async (client) => {
  const row = await client.query('SELECT web_enabled FROM public.users WHERE id = $1', [user]);
  assert.equal(row.rows[0].web_enabled, true);
});
console.log('CLI previewed the seeded user; its Web access is still enabled');
