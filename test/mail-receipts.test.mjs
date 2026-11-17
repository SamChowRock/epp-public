import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Webhook } from 'svix';
import {
  verifyMailEvent,
  createReceiptServer,
} from '../dist/src/mail-receipt-server.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { AppLogger } from '../dist/src/app-logger.js';
const secret = 'whsec_' + Buffer.alloc(32, 7).toString('base64'),
  wh = new Webhook(secret);
function signed(body, id = randomUUID(), date = new Date()) {
  return [
    'svix-id',
    id,
    'svix-timestamp',
    String(Math.floor(date.getTime() / 1000)),
    'svix-signature',
    wh.sign(id, date, body),
  ];
}
const body = () =>
  Buffer.from(
    JSON.stringify({
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id: randomUUID(),
        to: ['A@example.test'],
        bounce: { type: 'Permanent' },
      },
    }),
  );
test('signature validation uses exact bytes, timestamps, duplicate headers and fatal UTF8', () => {
  const b = body(),
    h = signed(b);
  assert.equal(verifyMailEvent(b, h, secret).recipient, 'a@example.test');
  const multiple = [...h];
  multiple[5] += ' v1,AAAAAAAA';
  assert.equal(
    verifyMailEvent(b, multiple, secret).recipient,
    'a@example.test',
  );
  for (const [data, headers] of [
    [Buffer.concat([b, Buffer.from(' ')]), h],
    [b, [...h, 'svix-id', 'duplicate']],
    [b, signed(b, randomUUID(), new Date(Date.now() - 600000))],
    [Buffer.from([255]), signed(Buffer.from([255]))],
    [b, h.map((x, i) => (i === 3 ? '1e9' : x))],
  ])
    assert.throws(() => verifyMailEvent(data, headers, secret));
});
test('real receipt HTTP path enforces limits and persists signed identities only', async (t) => {
  const database = new DatabaseService(
    { url: process.env.TEST_DATABASE_URL, poolMax: 5, queryDebug: false },
    new AppLogger('error'),
  );
  const server = createReceiptServer(database, {
    secret,
    providerScope: 'http-test',
    endpointScope: 'endpoint',
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await database.onModuleDestroy();
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  const b = body(),
    h = signed(b),
    headers = Object.fromEntries(
      Array.from({ length: h.length / 2 }, (_, i) => [h[i * 2], h[i * 2 + 1]]),
    );
  const send = (path, method, body, headers) =>
    fetch(url + path, { method, body, headers });
  assert.equal((await send('/missing', 'POST', b, headers)).status, 404);
  assert.equal((await send('/webhooks/resend', 'GET')).status, 405);
  assert.equal(
    (await send('/webhooks/resend', 'POST', b, headers)).status,
    415,
  );
  assert.equal(
    (
      await send('/webhooks/resend', 'POST', Buffer.alloc(65537), {
        'content-type': 'application/json',
        ...headers,
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await send('/webhooks/resend', 'POST', b, {
        'content-type': 'application/json',
        ...headers,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await send('/webhooks/resend', 'POST', b, {
        'content-type': 'application/json',
        ...headers,
      })
    ).status,
    204,
  );
  const changed = Buffer.concat([b, Buffer.from(' ')]),
    newh = signed(changed, h[1]);
  const hh = Object.fromEntries(
    Array.from({ length: newh.length / 2 }, (_, i) => [
      newh[i * 2],
      newh[i * 2 + 1],
    ]),
  );
  assert.equal(
    (
      await send('/webhooks/resend', 'POST', changed, {
        'content-type': 'application/json',
        ...hh,
      })
    ).status,
    409,
  );
  const [count] = await database.client
    .$queryRaw`SELECT count(*) AS n FROM verification_mail_events WHERE event_id=${h[1]}`;
  assert.equal(Number(count.n), 1);
});

import { spawn } from 'node:child_process';
async function childResult(expected, port, onReady) {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    RESEND_WEBHOOK_SECRET: secret,
    MAIL_PROVIDER_SCOPE: 'lifecycle',
    MAIL_ENDPOINT_SCOPE: 'endpoint',
    MAIL_RECEIPT_PORT: String(port),
  };
  const child = spawn(
    process.execPath,
    ['dist/src/mail-receipts.js', expected],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  const deadline = setTimeout(() => child.kill('SIGKILL'), 12000);
  let notified = false;
  child.stdout.on('data', (chunk) => {
    output += chunk;
    if (!notified && output.includes('receipts.ready')) {
      notified = true;
      onReady?.(child);
    }
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  clearTimeout(deadline);
  return { code, output };
}
test('receiver target guard, missing schema probe and SIGTERM close the real process', async () => {
  const database = new DatabaseService(
    { url: process.env.TEST_DATABASE_URL, poolMax: 5, queryDebug: false },
    new AppLogger('error'),
  );
  try {
    const expected = new URL(process.env.TEST_DATABASE_URL).pathname.slice(1);
    assert.equal((await childResult('wrong-database', 33549)).code, 1);
    await database.client.$executeRawUnsafe(
      'ALTER TABLE verification_mail_events RENAME TO verification_mail_events_unavailable',
    );
    try {
      const missing = await childResult(expected, 33549);
      assert.equal(missing.code, 1);
      assert.ok(!missing.output.includes('receipts.ready'));
    } finally {
      await database.client.$executeRawUnsafe(
        'ALTER TABLE verification_mail_events_unavailable RENAME TO verification_mail_events',
      );
    }
    const stopped = await childResult(expected, 33549, (child) =>
      child.kill('SIGTERM'),
    );
    assert.equal(stopped.code, 0);
    assert.match(stopped.output, /receipts.closed/);
    await assert.rejects(fetch('http://127.0.0.1:33549/webhooks/resend'));
    const [row] = await database.client
      .$queryRaw`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='epp-mail-receipts'`;
    assert.equal(Number(row.n), 0);
  } finally {
    await database.onModuleDestroy();
  }
});
