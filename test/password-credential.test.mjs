import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { DEVELOPMENT_USER_ID } from '../dist/src/database-config.js';
import { initializePassword, verifyPasswordCredential } from '../dist/src/password-credential.js';

test('initialization never replaces a credential, even when two initializers race; CLI hides secrets', async t => {
  const app = await createApp(), db = app.get(DatabaseService).client;
  const where = { userId: DEVELOPMENT_USER_ID };
  const before = await db.passwordCredential.findUnique({ where });
  let created = false;
  t.after(async () => {
    try { if (created) await db.passwordCredential.delete({ where }); }
    finally { await app.close(); }
  });
  const users = await db.user.findMany({ orderBy: { id: 'asc' } });
  const password = '\ufeff  Fabricated test password 32  ';
  if (before === null) {
    const attempts = await Promise.allSettled([
      initializePassword(db, password), initializePassword(db, password),
    ]);
    created = attempts.some(x => x.status === 'fulfilled');
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(attempts.find(x => x.status === 'rejected').reason.code, 'P2002');
    assert.equal(await verifyPasswordCredential(db, password), true);
    assert.equal(await verifyPasswordCredential(db, 'Another fabricated password'), false);
  }
  const saved = await db.passwordCredential.findUniqueOrThrow({ where });
  await assert.rejects(initializePassword(db, 'Do not replace this password'), { code: 'P2002' });
  assert.deepEqual(await db.passwordCredential.findUnique({ where }), saved);
  assert.deepEqual(await db.user.findMany({ orderBy: { id: 'asc' } }), users);
  async function command(args, input, extra = {}) {
    const child = spawn(process.execPath, ['scripts/password.mjs', ...args], {
      env: { ...process.env, NODE_ENV: 'test', DB_QUERY_DEBUG: 'false', ...extra },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', x => output += x);
    child.stderr.on('data', x => output += x);
    child.stdin.on('error', () => {});
    const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
    child.stdin.end(input);
    const code = await done;
    assert(!output.includes(password));
    assert(!output.includes(saved.passwordHash));
    assert(!output.includes(process.env.DATABASE_URL));
    return { code, output: output.trim() };
  }
  assert.deepEqual(await command(['init'], password), { code: 1, output: 'PASSWORD_ALREADY_EXISTS' });
  if (created) assert.deepEqual(await command(['verify'], password), { code: 0, output: 'PASSWORD_MATCH' });
  assert.deepEqual(await command(['verify'], ''), { code: 1, output: 'PASSWORD_NO_MATCH' });
  assert.equal((await command(['init', password], '')).output, 'PASSWORD_COMMAND_INVALID');
  assert.equal((await command(['init'], 'x'.repeat(1025))).output, 'PASSWORD_INPUT_INVALID');
  assert.equal((await command(['verify'], password, { NODE_ENV: 'development', DB_QUERY_DEBUG: 'true' })).output,
    'PASSWORD_QUERY_DEBUG_FORBIDDEN');
  assert.equal((await command(['verify'], password, { DATABASE_URL: 'invalid secret URL' })).output,
    'PASSWORD_OPERATION_FAILED');
});

 test('password CLI can initialize a second existing account without granting access', async t => {
  const { randomUUID } = await import('node:crypto');
  const app = await createApp(), db = app.get(DatabaseService).client, id = randomUUID();
  t.after(async () => { try {
    await db.passwordCredential.deleteMany({ where: { userId: id } });
    await db.user.deleteMany({ where: { id } });
  } finally { await app.close(); } });
  await db.user.create({ data: { id } });
  const input = 'Fabricated second local password';
  async function command(mode, target) {
    const child = spawn(process.execPath, ['scripts/password.mjs', mode, target], {
      env: { ...process.env, NODE_ENV: 'test', DB_QUERY_DEBUG: 'false' }, stdio: ['pipe','pipe','pipe'],
    });
    let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x);
    child.stdin.on('error', () => {});
    const done = new Promise((resolve,reject) => { child.on('error',reject); child.on('close',resolve); });
    child.stdin.end(input); const code = await done;
    assert(!output.includes(input)); assert(!output.includes(process.env.DATABASE_URL));
    return { code, output: output.trim() };
  }
  assert.deepEqual(await command('init', id), { code: 0, output: 'PASSWORD_CREATED' });
  assert.deepEqual(await command('verify', id), { code: 0, output: 'PASSWORD_MATCH' });
  assert.deepEqual(await command('init', id), { code: 1, output: 'PASSWORD_ALREADY_EXISTS' });
  assert.deepEqual(await command('init', 'invalid'), { code: 1, output: 'PASSWORD_COMMAND_INVALID' });
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  assert.equal(user.webEnabled, false); assert.equal(user.status, 'active');
});
