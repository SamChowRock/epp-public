import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { DatabaseService } from '../dist/src/database.service.js';
import { AppLogger } from '../dist/src/app-logger.js';
import { sendOne } from '../dist/src/verification-outbox.js';

test('a real send persists its attempt context before calling the transport', async (t) => {
  const database = new DatabaseService(
    { url: process.env.TEST_DATABASE_URL, poolMax: 5, queryDebug: false },
    new AppLogger('error'),
  );
  const db = database.client,
    id = randomUUID(),
    intent = randomUUID(),
    email = id + '@example.test',
    digest = randomBytes(32).toString('hex');
  t.after(async () => {
    await db.verificationMailControl.updateMany({
      where: { pausedBy: id },
      data: { pausedBy: null },
    });
    await db.verificationOutbox.deleteMany({ where: { id } });
    await db.verificationIntent.deleteMany({ where: { id: intent } });
    await database.onModuleDestroy();
  });
  await db.verificationIntent.create({
    data: {
      id: intent,
      email,
      purpose: 'register',
      tokenDigest: digest,
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  await db.verificationOutbox.create({
    data: {
      id,
      intentId: intent,
      generation: digest,
      recipient: email,
      purpose: 'register',
    },
  });
  let context;
  await sendOne(
    database,
    {
      provider: 'local',
      providerScope: 'practice',
      async send(...args) {
        context = args[5];
        const pre =
          await db.$queryRaw`SELECT id FROM verification_mail_attempts WHERE id=${context?.attemptId}::uuid`;
        assert.equal(pre.length, 1);
        return { providerMessageId: `<${randomUUID()}@epp.test>` };
      },
    },
    id,
  );
  assert.equal(typeof context?.attemptId, 'string');
  const rows =
    await db.$queryRaw`SELECT id FROM verification_mail_attempts WHERE outbox_id=${id}::uuid`;
  assert.equal(rows.length, 1);
});

import {
  recordMailEvent,
  releaseAddress,
  bindAttempt,
} from '../dist/src/mail-delivery-facts.js';
function event(
  id,
  recipient,
  type = 'email.bounced',
  bounceType = 'Permanent',
) {
  return {
    eventId: randomUUID(),
    bodySha256: 'b'.repeat(64),
    eventType: type,
    providerMessageId: id,
    recipient,
    occurredAt: new Date(),
    messageId: null,
    bounceType,
    bounceSubtype: null,
  };
}
async function fixture(t) {
  const database = new DatabaseService(
    { url: process.env.TEST_DATABASE_URL, poolMax: 5, queryDebug: false },
    new AppLogger('error'),
  );
  const db = database.client,
    email = randomUUID() + '@example.test';
  let n = 0;
  const jobs = [];
  async function job(recipient = email) {
    const id = randomUUID(),
      intent = randomUUID(),
      digest = randomBytes(32).toString('hex');
    await db.verificationIntent.create({
      data: {
        id: intent,
        email: recipient,
        purpose: 'register',
        tokenDigest: digest,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await db.verificationOutbox.create({
      data: {
        id,
        intentId: intent,
        generation: digest,
        recipient,
        purpose: 'register',
      },
    });
    jobs.push({ id, intent });
    return id;
  }
  t.after(async () => {
    await db.verificationMailControl.updateMany({
      where: { pausedBy: { in: jobs.map((j) => j.id) } },
      data: { pausedBy: null },
    });
    await db.verificationOutbox.deleteMany({
      where: { id: { in: jobs.map((j) => j.id) } },
    });
    await db.verificationIntent.deleteMany({
      where: { id: { in: jobs.map((j) => j.intent) } },
    });
    await database.onModuleDestroy();
  });
  const transport = (id, hook = async () => {}) => ({
    provider: 'resend',
    providerScope: 'practice',
    async send(...args) {
      await hook(args[5]);
      return { providerMessageId: id };
    },
  });
  const read = async (sql) => await db.$queryRawUnsafe(sql);
  return { database, db, email, job, transport, read };
}
for (const early of [true, false])
  test(
    'permanent event ' +
      (early ? 'before' : 'after') +
      ' finish associates once; release fences old epoch',
    async (t) => {
      const { database, db, email, job, transport } = await fixture(t),
        id = randomUUID(),
        e = event(id, email),
        jobId = await job();
      if (early) await recordMailEvent(database, 'practice', 'endpoint', e);
      assert.equal(await sendOne(database, transport(id), jobId), 'accepted');
      if (!early) await recordMailEvent(database, 'practice', 'endpoint', e);
      assert.equal(
        await recordMailEvent(database, 'practice', 'endpoint', e),
        'duplicate',
      );
      await assert.rejects(
        recordMailEvent(database, 'practice', 'endpoint', {
          ...e,
          bodySha256: 'c'.repeat(64),
        }),
        { code: 'EVENT_CONFLICT' },
      );
      let [a] =
        await db.$queryRaw`SELECT * FROM verification_mail_addresses WHERE recipient=${email}`;
      assert.equal(a.blocked, true);
      const release = {
        id: randomUUID(),
        recipient: email,
        expectedEpoch: '0',
        actor: 'author',
        reason: 'controlled address review',
      };
      assert.equal((await releaseAddress(database, release)).epoch, '1');
      assert.equal(
        (await releaseAddress(database, release)).result,
        'duplicate',
      );
      await assert.rejects(
        releaseAddress(database, { ...release, id: randomUUID() }),
        { code: 'EPOCH_CONFLICT' },
      );
      await recordMailEvent(
        database,
        'practice',
        'endpoint',
        event(id, email, 'email.complained'),
      );
      [a] =
        await db.$queryRaw`SELECT * FROM verification_mail_addresses WHERE recipient=${email}`;
      assert.equal(a.blocked, false);
      const facts =
        await db.$queryRaw`SELECT * FROM verification_mail_events WHERE provider_message_id=${id}`;
      assert.equal(facts.length, 2);
      assert.equal(
        facts.find((x) => x.event_type === 'email.complained').effect,
        'historical',
      );
      // Delete old instruction and intent; the original evidence remains independently readable.
      await db.verificationOutbox.delete({ where: { id: jobId } });
      assert.equal(
        (
          await db.$queryRaw`SELECT id FROM verification_mail_attempts WHERE outbox_id=${jobId}::uuid`
        ).length,
        1,
      );
      await recordMailEvent(
        database,
        'practice',
        'endpoint',
        event(id, email, 'email.delivered'),
      );
    },
  );
test('suppression leaves token and count unchanged, another address can send, new epoch can block again', async (t) => {
  const { database, db, email, job, transport } = await fixture(t),
    id = randomUUID();
  await sendOne(database, transport(id), await job());
  await recordMailEvent(database, 'practice', 'endpoint', event(id, email));
  await db.verificationIntent.deleteMany({ where: { email } });
  const pending = await job(),
    before = await db.verificationIntent.findUniqueOrThrow({
      where: { purpose_email: { purpose: 'register', email } },
    });
  let calls = 0;
  assert.equal(
    await sendOne(
      database,
      transport(randomUUID(), async () => {
        calls++;
      }),
      pending,
    ),
    'suppressed',
  );
  assert.equal(calls, 0);
  assert.equal(
    (await db.verificationOutbox.findUniqueOrThrow({ where: { id: pending } }))
      .attempts,
    0,
  );
  assert.equal(
    (
      await db.verificationIntent.findUniqueOrThrow({
        where: { id: before.id },
      })
    ).tokenDigest,
    before.tokenDigest,
  );
  assert.equal(
    await sendOne(
      database,
      transport(randomUUID()),
      await job(randomUUID() + '@example.test'),
    ),
    'accepted',
  );
  await releaseAddress(database, {
    id: randomUUID(),
    recipient: email,
    expectedEpoch: '0',
    actor: 'a',
    reason: 'r',
  });
  await db.verificationIntent.deleteMany({ where: { email } });
  const next = randomUUID();
  await sendOne(database, transport(next), await job());
  await recordMailEvent(database, 'practice', 'endpoint', event(next, email));
  assert.equal(
    (
      await db.$queryRaw`SELECT blocked FROM verification_mail_addresses WHERE recipient=${email}`
    )[0].blocked,
    true,
  );
});
for (const mode of ['lease', 'paused'])
  test(
    'late successful ' +
      mode +
      ' observation preserves ID without releasing gate',
    async (t) => {
      const { database, db, email, job, transport } = await fixture(t),
        messageId = randomUUID(),
        id = await job(),
        other = randomUUID();
      const result = await sendOne(
        database,
        transport(messageId, async () => {
          if (mode === 'lease')
            await db.$executeRaw`UPDATE verification_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${id}::uuid`;
          else
            await db.verificationMailControl.update({
              where: { id: 1 },
              data: { pausedBy: other },
            });
        }),
        id,
      );
      assert.equal(result, 'lost-after-send');
      const [a] =
        await db.$queryRaw`SELECT * FROM verification_mail_attempts WHERE outbox_id=${id}::uuid`;
      assert.equal(a.provider_message_id, messageId);
      assert.equal(a.send_outcome, 'accepted');
      assert.equal(
        (
          await db.verificationMailControl.findUniqueOrThrow({
            where: { id: 1 },
          })
        ).pausedBy,
        mode === 'lease' ? id : other,
      );
      await recordMailEvent(
        database,
        'practice',
        'endpoint',
        event(messageId, email),
      );
      assert.equal(
        (
          await db.$queryRaw`SELECT blocked FROM verification_mail_addresses WHERE recipient=${email}`
        )[0].blocked,
        true,
      );
      await db.verificationMailControl.update({
        where: { id: 1 },
        data: { pausedBy: null },
      });
    },
  );
test('100 early facts all associate, capacity rejects new identity but accepts duplicate', async (t) => {
  const { database, db, email, job, transport } = await fixture(t),
    id = randomUUID();
  let first;
  for (let n = 0; n < 100; n++) {
    const e = event(id, email, n === 99 ? 'email.complained' : 'email.sent');
    first ??= e;
    await recordMailEvent(database, 'practice', 'endpoint', e);
  }
  assert.equal(
    await recordMailEvent(database, 'practice', 'endpoint', first),
    'duplicate',
  );
  await assert.rejects(
    recordMailEvent(database, 'practice', 'endpoint', event(id, email)),
    { code: 'EVENT_CAPACITY' },
  );
  await sendOne(database, transport(id), await job());
  const [count] =
    await db.$queryRaw`SELECT count(*) AS n FROM verification_mail_events WHERE provider_message_id=${id} AND attempt_id IS NOT NULL`;
  assert.equal(Number(count.n), 100);
});
test('manual binding retains unknown and global pause; duplicate provider ID rejects whole finish', async (t) => {
  const { database, db, email, job, transport } = await fixture(t),
    id = await job(),
    messageId = randomUUID();
  await recordMailEvent(
    database,
    'practice',
    'endpoint',
    event(messageId, email),
  );
  assert.equal(
    await sendOne(
      database,
      {
        provider: 'resend',
        providerScope: 'practice',
        async send() {
          throw Error('lost');
        },
      },
      id,
    ),
    'unknown',
  );
  const [a] =
    await db.$queryRaw`SELECT id FROM verification_mail_attempts WHERE outbox_id=${id}::uuid`;
  await bindAttempt(database, {
    attemptId: a.id,
    providerScope: 'practice',
    providerMessageId: messageId,
    actor: 'author',
    reason: 'reviewed',
    evidenceRef: 'local-case-1',
  });
  assert.equal(
    (await db.verificationOutbox.findUniqueOrThrow({ where: { id } })).status,
    'unknown',
  );
  assert.equal(
    (await db.verificationMailControl.findUniqueOrThrow({ where: { id: 1 } }))
      .pausedBy,
    id,
  );
  assert.equal(
    await sendOne(
      database,
      transport(randomUUID()),
      await job(randomUUID() + '@example.test'),
    ),
    'paused',
  );
  await db.verificationMailControl.update({
    where: { id: 1 },
    data: { pausedBy: null },
  });
  const second = await job(randomUUID() + '@example.test');
  await assert.rejects(sendOne(database, transport(messageId), second));
  const [b] =
    await db.$queryRaw`SELECT observed_at,provider_message_id FROM verification_mail_attempts WHERE outbox_id=${second}::uuid`;
  assert.equal(b.observed_at, null);
  assert.equal(b.provider_message_id, null);
});
for (const [kind, type, to] of [
  ['temporary', 'email.bounced', 'same'],
  ['missing bounce type', 'email.bounced', 'same'],
  ['wrong recipient', 'email.complained', 'other'],
  ['multiple recipients', 'email.complained', 'null'],
  ['unsupported', 'email.opened', 'same'],
  ['delayed', 'email.delivery_delayed', 'same'],
])
  test(kind + ' does not suppress', async (t) => {
    const { database, db, email, job, transport } = await fixture(t),
      id = randomUUID();
    await sendOne(database, transport(id), await job());
    await recordMailEvent(
      database,
      'practice',
      'endpoint',
      event(
        id,
        to === 'same' ? email : to === 'other' ? 'other@example.test' : null,
        type,
        kind === 'temporary' ? 'Temporary' : null,
      ),
    );
    assert.equal(
      (
        await db.$queryRaw`SELECT blocked FROM verification_mail_addresses WHERE recipient=${email}`
      )[0].blocked,
      false,
    );
  });
for (const first of ['event', 'finish'])
  test(
    'concurrent ' + first + ' channel lock ordering preserves all evidence',
    async (t) => {
      const { database, db, email, job, transport } = await fixture(t),
        messageId = randomUUID(),
        id = await job(),
        e = event(messageId, email);
      if (first === 'event')
        assert.equal(
          await sendOne(
            database,
            transport(messageId, async () => {
              await Promise.all([
                recordMailEvent(database, 'practice', 'endpoint', e),
                recordMailEvent(database, 'practice', 'endpoint', e),
              ]);
            }),
            id,
          ),
          'accepted',
        );
      else {
        await sendOne(database, transport(messageId), id);
        await Promise.all([
          recordMailEvent(database, 'practice', 'endpoint', e),
          recordMailEvent(database, 'practice', 'endpoint', e),
        ]);
      }
      const facts =
        await db.$queryRaw`SELECT * FROM verification_mail_events WHERE provider_message_id=${messageId}`;
      assert.equal(facts.length, 1);
      assert.ok(facts[0].attempt_id);
      assert.equal(facts[0].effect, 'suppressed');
    },
  );
test('release during network response preserves attempt old epoch; release before prepare fixes next epoch', async (t) => {
  const { database, db, email, job, transport } = await fixture(t),
    id = randomUUID();
  await sendOne(
    database,
    transport(id, async () => {
      await releaseAddress(database, {
        id: randomUUID(),
        recipient: email,
        expectedEpoch: '0',
        actor: 'a',
        reason: 'review',
      });
    }),
    await job(),
  );
  await recordMailEvent(database, 'practice', 'endpoint', event(id, email));
  assert.equal(
    (
      await db.$queryRaw`SELECT blocked FROM verification_mail_addresses WHERE recipient=${email}`
    )[0].blocked,
    false,
  );
  await db.verificationIntent.deleteMany({ where: { email } });
  const next = randomUUID();
  await sendOne(database, transport(next), await job());
  await recordMailEvent(database, 'practice', 'endpoint', event(next, email));
  assert.equal(
    (
      await db.$queryRaw`SELECT blocked FROM verification_mail_addresses WHERE recipient=${email}`
    )[0].blocked,
    true,
  );
});

for (const first of ['event', 'finish'])
  test(
    'real blocked PG queue orders ' + first + ' and reconciles exactly once',
    async (t) => {
      const { database, db, email, job, transport } = await fixture(t),
        id = await job(),
        messageId = randomUUID();
      let enter, release;
      const entered = new Promise((r) => (enter = r)),
        network = new Promise((r) => (release = r));
      const sending = sendOne(
        database,
        transport(messageId, async () => {
          enter();
          await network;
        }),
        id,
      );
      await entered;
      const lock = await database.pool.connect();
      await lock.query('BEGIN');
      await lock.query(
        'SELECT id FROM verification_mail_control WHERE id=1 FOR UPDATE',
      );
      async function waitBlocked(n) {
        for (let attempt = 0; attempt < 100; attempt++) {
          await lock.query('SELECT pg_stat_clear_snapshot()');
          const { rows } = await lock.query(
            "SELECT count(*) AS n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) OR wait_event_type='Lock' AND datname=current_database()",
            [lock.processID],
          );
          if (Number(rows[0].n) >= n) return;
          await new Promise((r) => setTimeout(r, 5));
        }
        throw Error('Expected blocked transactions');
      }
      let receipt;
      try {
        if (first === 'event') {
          receipt = recordMailEvent(
            database,
            'practice',
            'endpoint',
            event(messageId, email),
          );
          await waitBlocked(1);
          release();
        } else {
          release();
          await waitBlocked(1);
          receipt = recordMailEvent(
            database,
            'practice',
            'endpoint',
            event(messageId, email),
          );
        }
        await waitBlocked(2);
      } finally {
        await lock.query('ROLLBACK');
        lock.release();
      }
      assert.equal(await sending, 'accepted');
      await receipt;
      const [fact] =
        await db.$queryRaw`SELECT attempt_id,effect FROM verification_mail_events WHERE provider_message_id=${messageId}`;
      assert.ok(fact.attempt_id);
      assert.equal(fact.effect, 'suppressed');
    },
  );

import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResendDelivery } from '../dist/src/resend-delivery.js';
test('admin CLI checks target and 0600 before audited bind/release without changing unknown', async (t) => {
  const { database, db, email, job } = await fixture(t),
    id = await job(),
    messageId = randomUUID();
  await sendOne(
    database,
    {
      provider: 'resend',
      providerScope: 'practice',
      async send() {
        throw Error();
      },
    },
    id,
  );
  const [attempt] =
    await db.$queryRaw`SELECT id FROM verification_mail_attempts WHERE outbox_id=${id}::uuid`;
  const folder = await mkdtemp(join(tmpdir(), 'epp54-admin-')),
    file = join(folder, 'request.json');
  t.after(() => rm(folder, { recursive: true, force: true }));
  const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    expected = new URL(process.env.TEST_DATABASE_URL).pathname.slice(1);
  const run = (target, action) =>
    spawnSync(
      process.execPath,
      ['dist/src/mail-admin.js', target, action, file],
      { env, encoding: 'utf8', timeout: 10000 },
    );
  await writeFile(
    file,
    JSON.stringify({
      attemptId: attempt.id,
      providerScope: 'practice',
      providerMessageId: messageId,
      actor: 'author',
      reason: 'reviewed',
      evidenceRef: 'case-54-cli',
    }),
    { mode: 0o600 },
  );
  assert.equal(run('wrong-db', 'bind').status, 1);
  assert.equal(
    (
      await db.$queryRaw`SELECT provider_message_id FROM verification_mail_attempts WHERE id=${attempt.id}::uuid`
    )[0].provider_message_id,
    null,
  );
  await chmod(file, 0o644);
  assert.equal(run(expected, 'bind').status, 1);
  await chmod(file, 0o600);
  assert.equal(run(expected, 'bind').status, 0);
  assert.equal(run(expected, 'bind').status, 1);
  await recordMailEvent(
    database,
    'practice',
    'endpoint',
    event(messageId, email),
  );
  const release = {
    id: randomUUID(),
    recipient: email,
    expectedEpoch: '0',
    actor: 'author',
    reason: 'controlled recovery',
  };
  await writeFile(file, JSON.stringify(release));
  const result = run(expected, 'release');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).epoch, '1');
  assert.equal(JSON.parse(run(expected, 'release').stdout).result, 'duplicate');
  await writeFile(
    file,
    JSON.stringify({ ...release, reason: 'changed input' }),
  );
  assert.equal(run(expected, 'release').status, 1);
  assert.equal(
    (await db.verificationOutbox.findUniqueOrThrow({ where: { id } })).status,
    'unknown',
  );
  assert.equal(
    (await db.verificationMailControl.findUniqueOrThrow({ where: { id: 1 } }))
      .pausedBy,
    id,
  );
});
for (const [name, response] of [
  ['5xx', () => new Response('{}', { status: 503 })],
  ['redirect', () => new Response('', { status: 302 })],
  ['missing id', () => new Response('{}')],
  ['truncated', () => new Response('{')],
])
  test(
    'Resend ' + name + ' pauses global channel without retrying',
    async (t) => {
      const { database, db, job } = await fixture(t),
        id = await job();
      let calls = 0;
      const delivery = new ResendDelivery(
        {
          apiKey: 'fictional',
          from: 'test@example.test',
          providerScope: 'practice',
        },
        async () => {
          calls++;
          return response();
        },
      );
      assert.equal(await sendOne(database, delivery, id), 'unknown');
      assert.equal(
        await sendOne(
          database,
          delivery,
          await job(randomUUID() + '@example.test'),
        ),
        'paused',
      );
      assert.equal(calls, 1);
      const row = await db.verificationOutbox.findUniqueOrThrow({
        where: { id },
      });
      assert.equal(row.attempts, 1);
      assert.equal(row.retryDigest, null);
    },
  );

import { createServer as createSmtp } from 'node:net';
import { createInterface } from 'node:readline';
import { LocalMailDelivery } from '../dist/src/verification-delivery.js';
for (const mode of [
  'accepted',
  'deferred',
  'refused',
  'drop',
  'connect-refused',
])
  test(
    'real loopback SMTP ' +
      mode +
      ' preserves original outcome and Message-ID evidence',
    async (t) => {
      const { database, db, job } = await fixture(t),
        sockets = new Set();
      let observedMessageId = null;
      const server = createSmtp((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => socket.destroy());
        const lines = createInterface({ input: socket, crlfDelay: Infinity });
        let data = false;
        const reply = (s) => socket.write(s + '\r\n');
        reply('220 test');
        lines.on('line', (line) => {
          if (data) {
            if (line.startsWith('Message-ID: '))
              observedMessageId = line.slice(12);
            if (line === '.') {
              data = false;
              if (mode === 'drop') socket.destroy();
              else reply('250 accepted');
            }
            return;
          }
          if (/^(EHLO|HELO|MAIL FROM:)/i.test(line)) reply('250 test');
          else if (/^RCPT TO:/i.test(line))
            reply(
              mode === 'deferred'
                ? '450 deferred'
                : mode === 'refused'
                  ? '550 refused'
                  : '250 OK',
            );
          else if (line === 'DATA') {
            data = true;
            reply('354 continue');
          } else if (line === 'QUIT') socket.end('221 bye\r\n');
          else reply('502 unsupported');
        });
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const port = server.address().port;
      t.after(async () => {
        for (const socket of sockets) socket.destroy();
        if (server.listening) await new Promise((r) => server.close(r));
      });
      if (mode === 'connect-refused') await new Promise((r) => server.close(r));
      const id = await job(),
        result = await sendOne(
          database,
          new LocalMailDelivery({ localSmtpPort: port }),
          id,
        );
      assert.equal(
        result,
        mode === 'accepted'
          ? 'accepted'
          : mode === 'refused'
            ? 'dead'
            : mode === 'drop'
              ? 'unknown'
              : 'retry-scheduled',
      );
      const [fact] =
        await db.$queryRaw`SELECT provider,provider_message_id,send_outcome FROM verification_mail_attempts WHERE outbox_id=${id}::uuid`;
      assert.equal(fact.provider, 'local');
      if (mode === 'accepted') {
        assert.ok(observedMessageId);
        assert.equal(fact.provider_message_id, observedMessageId);
      } else assert.equal(fact.provider_message_id, null);
    },
  );
test('missing receipt or invalid Resend identity cannot manufacture accepted', async (t) => {
  const { database, db, job } = await fixture(t);
  for (const receipt of [undefined, { providerMessageId: 'not-a-uuid' }]) {
    const id = await job(randomUUID() + '@example.test');
    assert.equal(
      await sendOne(
        database,
        {
          provider: 'resend',
          providerScope: 'practice',
          async send() {
            return receipt;
          },
        },
        id,
      ),
      'unknown',
    );
    assert.equal(
      (await db.verificationOutbox.findUniqueOrThrow({ where: { id } })).status,
      'unknown',
    );
    await db.verificationMailControl.update({
      where: { id: 1 },
      data: { pausedBy: null },
    });
  }
});

test('bounded cleanup checks target, preserves paused/young rows and retains attempt evidence', async (t) => {
  const { database, db, job, transport } = await fixture(t),
    id = await job(),
    young = await job(randomUUID() + '@example.test');
  await sendOne(database, transport(randomUUID()), id);
  await sendOne(database, transport(randomUUID()), young);
  await db.$executeRaw`UPDATE verification_outbox SET retain_from=clock_timestamp()-interval '31 days' WHERE id=${id}::uuid`;
  const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    expected = new URL(process.env.TEST_DATABASE_URL).pathname.slice(1);
  const run = (target) =>
    spawnSync(
      process.execPath,
      ['database/chapter-54-mail-delivery/cleanup.mjs', target],
      { env, encoding: 'utf8', timeout: 10000 },
    );
  assert.notEqual(run('wrong-db').status, 0);
  assert.ok(await db.verificationOutbox.findUnique({ where: { id } }));
  await db.verificationMailControl.update({
    where: { id: 1 },
    data: { pausedBy: id },
  });
  assert.equal(run(expected).status, 0);
  assert.ok(await db.verificationOutbox.findUnique({ where: { id } }));
  await db.verificationMailControl.update({
    where: { id: 1 },
    data: { pausedBy: null },
  });
  assert.equal(run(expected).status, 0);
  assert.equal(await db.verificationOutbox.findUnique({ where: { id } }), null);
  assert.ok(await db.verificationOutbox.findUnique({ where: { id: young } }));
  assert.equal(
    (
      await db.$queryRaw`SELECT id FROM verification_mail_attempts WHERE outbox_id=${id}::uuid`
    ).length,
    1,
  );
});
