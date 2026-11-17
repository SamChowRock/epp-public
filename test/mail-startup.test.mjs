import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { DatabaseService } from '../dist/src/database.service.js';
import { AppLogger } from '../dist/src/app-logger.js';

async function runChild(role, env, expected, id) {
  const args = [
    `dist/src/${role}.js`,
    expected,
    ...(role === 'send-one' ? [id] : []),
  ];
  const child = spawn(process.execPath, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '',
    stopped = false;
  const deadline = setTimeout(() => child.kill('SIGKILL'), 12000);
  const collect = (chunk) => {
    output += chunk;
    // Intact-schema worker control finishes one real message before graceful shutdown.
    if (
      role === 'mail-worker' &&
      !stopped &&
      output.includes('"event":"worker.result"') &&
      output.includes('"code":"accepted"')
    ) {
      stopped = true;
      child.kill('SIGTERM');
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  clearTimeout(deadline);
  return { code, output };
}
for (const role of ['mail-worker', 'send-one'])
  test(`${role} probes events before any network or preparation; intact schema sends normally`, async () => {
    const database = new DatabaseService(
      { url: process.env.TEST_DATABASE_URL, poolMax: 5, queryDebug: false },
      new AppLogger('error'),
    );
    const db = database.client,
      id = randomUUID(),
      intentId = randomUUID(),
      email = id + '@example.test',
      digest = randomBytes(32).toString('hex');
    const originalChannel = await db.verificationMailControl.findUniqueOrThrow({
      where: { id: 1 },
    });
    assert.equal(
      originalChannel.pausedBy,
      null,
      'isolated startup test requires open channel',
    );
    let contacts = 0,
      renamed = false;
    const sockets = new Set();
    const smtp = createServer((socket) => {
      contacts++;
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => socket.destroy());
      const lines = createInterface({ input: socket, crlfDelay: Infinity });
      let data = false;
      const reply = (value) => socket.write(value + '\r\n');
      reply('220 startup-test');
      lines.on('line', (line) => {
        if (data) {
          if (line === '.') {
            data = false;
            reply('250 accepted');
          }
          return;
        }
        if (/^(EHLO|HELO|MAIL FROM:|RCPT TO:)/i.test(line))
          reply('250 startup-test');
        else if (line === 'DATA') {
          data = true;
          reply('354 continue');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else reply('502 unsupported');
      });
    });
    try {
      await new Promise((resolve) => smtp.listen(0, '127.0.0.1', resolve));
      await db.verificationIntent.create({
        data: {
          id: intentId,
          email,
          purpose: 'register',
          tokenDigest: digest,
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      await db.verificationOutbox.create({
        data: {
          id,
          intentId,
          generation: digest,
          recipient: email,
          purpose: 'register',
          availableAt: new Date(0),
        },
      });
      const before = await db.verificationOutbox.findUniqueOrThrow({
        where: { id },
      });
      const env = {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        MAIL_PROVIDER: 'local',
        LOCAL_SMTP_PORT: String(smtp.address().port),
        LOG_LEVEL: 'info',
      };
      const expected = new URL(process.env.TEST_DATABASE_URL).pathname.slice(1);
      await db.$executeRawUnsafe(
        'ALTER TABLE verification_mail_events RENAME TO verification_mail_events_startup_unavailable',
      );
      renamed = true;
      let missing;
      try {
        missing = await runChild(role, env, expected, id);
      } finally {
        await db.$executeRawUnsafe(
          'ALTER TABLE verification_mail_events_startup_unavailable RENAME TO verification_mail_events',
        );
        renamed = false;
      }
      assert.equal(missing.code, 1, missing.output);
      assert.equal(
        contacts,
        0,
        'missing events table must be detected before SMTP contact',
      );
      assert.ok(
        !missing.output.includes('"event":"database.ready"'),
        missing.output,
      );
      assert.ok(
        !missing.output.includes('"event":"worker.ready"'),
        missing.output,
      );
      assert.deepEqual(
        await db.verificationOutbox.findUniqueOrThrow({ where: { id } }),
        before,
      );
      assert.equal(
        (
          await db.verificationIntent.findUniqueOrThrow({
            where: { id: intentId },
          })
        ).tokenDigest,
        digest,
      );
      assert.equal(
        (
          await db.$queryRaw`SELECT id FROM verification_mail_attempts WHERE outbox_id=${id}::uuid`
        ).length,
        0,
      );
      assert.deepEqual(
        await db.verificationMailControl.findUniqueOrThrow({
          where: { id: 1 },
        }),
        originalChannel,
      );
      const intact = await runChild(role, env, expected, id);
      assert.equal(intact.code, 0, intact.output);
      assert.match(intact.output, /database.ready/);
      if (role === 'mail-worker') assert.match(intact.output, /worker.ready/);
      assert.equal(contacts, 1);
      assert.equal(
        (await db.verificationOutbox.findUniqueOrThrow({ where: { id } }))
          .status,
        'accepted',
      );
      assert.equal(
        (
          await db.$queryRaw`SELECT id FROM verification_mail_attempts WHERE outbox_id=${id}::uuid`
        ).length,
        1,
      );
      assert.deepEqual(
        await db.verificationMailControl.findUniqueOrThrow({
          where: { id: 1 },
        }),
        originalChannel,
      );
    } finally {
      if (renamed)
        await db.$executeRawUnsafe(
          'ALTER TABLE verification_mail_events_startup_unavailable RENAME TO verification_mail_events',
        );
      for (const socket of sockets) socket.destroy();
      if (smtp.listening) await new Promise((resolve) => smtp.close(resolve));
      await db.verificationMailControl.updateMany({
        where: { pausedBy: id },
        data: { pausedBy: originalChannel.pausedBy },
      });
      await db.verificationOutbox.deleteMany({ where: { id } });
      await db.verificationIntent.deleteMany({ where: { id: intentId } });
      await database.onModuleDestroy();
    }
  });
