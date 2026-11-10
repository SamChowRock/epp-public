import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { SessionService } from '../dist/src/session.service.js';
import { RecoveryService } from '../dist/src/recovery.service.js';
import { ApplicationState } from '../dist/src/application-state.js';
import { sendOne } from '../dist/src/verification-outbox.js';
import { EmailSchema, RecoveryConfirmSchema } from '../dist/src/recovery-contract.js';
import { LoginSchema } from '../dist/src/auth-contract.js';
import { createOpenApiDocument } from '../dist/src/openapi.js';
import { issueToken, tokenDigest } from '../dist/src/token.js';
import { verifyPassword } from '../dist/src/password.js';

const password = 'Fictional registration password 36';
const nextPassword = 'Fictional replacement password 36';
const invalid = error => error.code === 'VERIFICATION_INVALID';
async function fixture(t, delivery) {
  const app = await createApp(); await app.init();
  const database = app.get(DatabaseService), db = database.client, sessions = app.get(SessionService);
  const emails = [], messages = [];
  const recovery = new RecoveryService(database, sessions, app.get(ApplicationState));
  const transport = delivery ?? { async send(email, purpose, token, issuedAt, expiresAt) { messages.push({ email, purpose, token, issuedAt, expiresAt }); } };
  async function dispatch(id) { return sendOne(database, transport, id); }
  t.after(async () => {
    try {
      const contacts = await db.verifiedEmail.findMany({ where: { email: { in: emails } } });
      const ids = contacts.map(x => x.userId);
      const jobs = await db.verificationOutbox.findMany({ where: { recipient: { in: emails } }, select: { id: true } });
      await db.verificationMailControl.updateMany({ where: { pausedBy: { in: jobs.map(job => job.id) } }, data: { pausedBy: null } });
      await db.verificationOutbox.deleteMany({ where: { recipient: { in: emails } } });
      await db.verificationIntent.deleteMany({ where: { email: { in: emails } } });
      await db.verifiedEmail.deleteMany({ where: { email: { in: emails } } });
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.passwordCredential.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    } finally { await app.close(); }
  });
  const address = () => { const email = randomUUID() + '@example.test'; emails.push(email); return email; };
  async function issue(purpose, email) {
    await recovery.request(purpose, email);
    const job = await db.verificationOutbox.findFirstOrThrow({ where: { purpose, recipient: email, status: 'pending' } });
    assert.equal(await dispatch(job.id), 'accepted');
    return messages.at(-1).token;
  }
  async function register(email = address()) {
    const token = await issue('register', email);
    const result = await recovery.confirm('register', { token, newPassword: password });
    return { ...result, email, token };
  }
  return { app, database, db, sessions, recovery, address, messages, issue, register, dispatch };
}

test('address policy preserves aliases; public routes document no Cookie/CSRF requirement', () => {
  assert.equal(EmailSchema.parse(' Reader.Tag+book@EXAMPLE.test '), 'reader.tag+book@example.test');
  for (const input of ['a\nb@example.test', 'Name <a@example.test>', '用户@example.test', 'a@localhost', 'a'.repeat(65) + '@example.test']) {
    assert.equal(EmailSchema.safeParse(input).success, false);
  }
  assert.equal(LoginSchema.safeParse({ userId: randomUUID(), email: 'a@example.test', password }).success, false);
  assert.equal(RecoveryConfirmSchema.safeParse({ token: 'a'.repeat(43), newPassword: password }).success, false);
  const doc = createOpenApiDocument();
  for (const path of ['/auth/register/request', '/auth/register/confirm', '/auth/reset/request', '/auth/reset/confirm']) {
    assert.deepEqual(doc.paths[path].post.security, []);
    assert(!doc.paths[path].post.parameters.some(p => p.name === 'X-CSRF-Token'));
  }
});

test('concurrent registration consumes once; pending requests never reserve an account or grant Web access', async t => {
  const { recovery, db, issue, address, sessions } = await fixture(t), email = address();
  const token = await issue('register', email);
  assert.equal(await db.verifiedEmail.count({ where: { email } }), 0);
  const row = await db.verificationIntent.findUniqueOrThrow({ where: { tokenDigest: tokenDigest(token) } });
  assert(!JSON.stringify(row).includes(token));
  await assert.rejects(recovery.confirm('reset', { token, newPassword: password }), invalid);
  await assert.rejects(recovery.confirm('register', { token, newPassword: email }), e => e.code === 'PASSWORD_BLOCKLISTED');
  const results = await Promise.allSettled([1, 2].map(() => recovery.confirm('register', { token, newPassword: password })));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.find(x => x.status === 'rejected').reason.code, 'VERIFICATION_INVALID');
  const contact = await db.verifiedEmail.findUniqueOrThrow({ where: { email } });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: contact.userId } })).webEnabled, false);
  await assert.rejects(sessions.login({ email, password, label: 'Not enabled' }), e => e.code === 'WEB_ACCESS_DENIED');
  assert.equal(await db.session.count({ where: { userId: contact.userId } }), 0);
});

test('cooldown is atomic; resend replaces old token; absent recovery cannot bind to a later registration', async t => {
  const { recovery, db, issue, address, messages, register } = await fixture(t), email = address();
  const token = await issue('register', email);
  const responses = await Promise.all([recovery.request('register', email), recovery.request('register', email)]);
  assert.deepEqual(responses[0], responses[1]); assert.equal(messages.length, 1);
  assert.equal(await db.verificationOutbox.count({ where: { recipient: email } }), 1);
  await db.verificationIntent.updateMany({ where: { email }, data: { issuedAt: new Date(Date.now() - 61000) } });
  const fresh = await issue('register', email); assert.notEqual(fresh, token);
  await assert.rejects(recovery.confirm('register', { token, newPassword: password }), invalid);
  const absent = address(), reset = await issue('reset', absent);
  await register(absent);
  await assert.rejects(recovery.confirm('reset', { token: reset, newPassword: nextPassword }), invalid);
  await db.verificationIntent.update({ where: { tokenDigest: tokenDigest(fresh) }, data: {
    issuedAt: new Date(Date.now() - 120000), expiresAt: new Date(Date.now() - 1000),
  } });
  await assert.rejects(recovery.confirm('register', { token: fresh, newPassword: password }), invalid);
});

test('reset replaces credentials and revokes sessions atomically; active change invalidates previously issued reset', async t => {
  const { recovery, db, sessions, issue, register } = await fixture(t), user = await register();
  await db.user.update({ where: { id: user.userId }, data: { webEnabled: true } });
  const login = await sessions.login({ email: user.email, password, label: 'Before reset' });
  const token = await issue('reset', user.email);
  await assert.rejects(recovery.confirm('reset', { token, newPassword: user.email }), e => e.code === 'PASSWORD_BLOCKLISTED');
  await assert.rejects(sessions.changePassword(login.identity, { currentPassword: password, newPassword: user.email }),
    e => e.code === 'PASSWORD_BLOCKLISTED');
  assert(await sessions.authenticate(login.token));
  const results = await Promise.allSettled([1, 2].map(() => recovery.confirm('reset', { token, newPassword: nextPassword })));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(await sessions.authenticate(login.token), undefined);
  await assert.rejects(sessions.login({ userId: user.userId, password, label: 'Old' }), e => e.code === 'AUTH_REQUIRED');
  const next = await sessions.login({ email: user.email, password: nextPassword, label: 'After reset' });
  await db.verificationIntent.updateMany({ where: { email: user.email }, data: { issuedAt: new Date(Date.now() - 61000) } });
  const oldReset = await issue('reset', user.email);
  await sessions.changePassword(next.identity, { currentPassword: nextPassword, newPassword: password });
  await assert.rejects(recovery.confirm('reset', { token: oldReset, newPassword: nextPassword }), invalid);
  const credential = await db.passwordCredential.findUniqueOrThrow({ where: { userId: user.userId } });
  assert.equal(credential.version, 3); assert(await verifyPassword(credential.passwordHash, password));
});

test('delivery failure preserves intent, response privacy and shared password capacity', async t => {
  const { recovery, db, address, sessions, app, dispatch } = await fixture(t, { async send() { throw new Error('secret provider detail'); } });
  const email = address(), first = await recovery.request('reset', email);
  const secondEmail = address();
  assert.deepEqual(await recovery.request('register', secondEmail), first);
  assert.equal(await db.verificationIntent.count({ where: { email } }), 1);
  let release; const gate = new Promise(r => release = r);
  const work = [sessions.passwordWork(() => gate), sessions.passwordWork(() => gate)];
  assert.throws(() => recovery.confirm('register', { token: issueToken(), newPassword: password }), e => e.code === 'AUTH_BUSY');
  release(); await Promise.all(work); assert.equal(app.get(ApplicationState).active, 0);
  const job = await db.verificationOutbox.findFirstOrThrow({ where: { recipient: email } });
  assert.equal(await dispatch(job.id), 'unknown');
  const second = await db.verificationOutbox.findFirstOrThrow({ where: { purpose: 'register', recipient: secondEmail } });
  assert.equal(await dispatch(second.id), 'paused');
  assert.equal((await db.verificationOutbox.findUniqueOrThrow({ where: { id: second.id } })).status, 'pending');
  assert.equal((await db.verificationMailControl.updateMany({ where: { id: 1, pausedBy: second.id }, data: { pausedBy: null } })).count, 0);
  assert.equal(await dispatch(second.id), 'paused');
  assert.equal((await db.verificationMailControl.updateMany({ where: { id: 1, pausedBy: job.id }, data: { pausedBy: null } })).count, 1);
  assert.equal(await dispatch(job.id), 'empty');
  const requests = [recovery.request('register', address()), recovery.request('register', address())];
  assert.throws(() => recovery.request('register', address()), e => e.code === 'DELIVERY_BUSY');
  await Promise.all(requests);
  assert.equal(app.get(ApplicationState).active, 0);
});

test('expiry is checked after waiting for the intent lock; disabled users stay disabled', async t => {
  const { recovery, database, db, register, issue } = await fixture(t), user = await register();
  const token = await issue('reset', user.email), digest = tokenDigest(token);
  await db.user.update({ where: { id: user.userId }, data: { status: 'disabled' } });
  await assert.rejects(recovery.confirm('reset', { token, newPassword: nextPassword }), invalid);
  await db.user.update({ where: { id: user.userId }, data: { status: 'active' } });
  const lock = await database.pool.connect();
  try {
    await lock.query('BEGIN');
    await lock.query('SELECT id FROM public.verification_intents WHERE token_digest=$1 FOR UPDATE', [digest]);
    const confirmation = recovery.confirm('reset', { token, newPassword: nextPassword });
    for (let n = 0; ; n++) {
      const result = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%verification_intents%'`;
      if (result[0].count) break;
      assert(n < 50); await new Promise(r => setTimeout(r, 10));
    }
    await lock.query("UPDATE public.verification_intents SET issued_at=clock_timestamp()-interval '16 minutes', expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [digest]);
    await lock.query('COMMIT');
    await assert.rejects(confirmation, invalid);
    const credential = await db.passwordCredential.findUniqueOrThrow({ where: { userId: user.userId } });
    assert.equal(credential.version, 1);
  } finally { await lock.query('ROLLBACK'); lock.release(); }
});

test('a replaced, expired or already attempted mailing cannot issue another usable token', async t => {
  const { db, recovery, address, dispatch, messages } = await fixture(t);
  const email = address();
  await recovery.request('register', email);
  const old = await db.verificationOutbox.findFirstOrThrow({ where: { recipient: email } });
  await db.verificationIntent.updateMany({ where: { email }, data: { issuedAt: new Date(Date.now() - 61000) } });
  await recovery.request('register', email);
  const current = await db.verificationOutbox.findFirstOrThrow({ where: { recipient: email, id: { not: old.id } } });
  assert.equal(await dispatch(old.id), 'obsolete');
  const results = await Promise.all([dispatch(current.id), dispatch(current.id)]);
  assert.equal(results.filter(result => result === 'accepted').length, 1);
  assert(results.some(result => result === 'busy' || result === 'empty'));
  assert.equal(messages.length, 1);
  const other = address();
  await recovery.request('register', other);
  const expired = await db.verificationOutbox.findFirstOrThrow({ where: { recipient: other } });
  await db.verificationIntent.updateMany({ where: { email: other }, data: {
    issuedAt: new Date(Date.now() - 960000), expiresAt: new Date(Date.now() - 1000),
  } });
  assert.equal(await dispatch(expired.id), 'obsolete');
  assert.equal(messages.length, 1);
});

test('a locked candidate is skipped; a replacement claim fences its predecessor before SMTP', async t => {
  const { database, db, recovery, address } = await fixture(t);
  const { claimOne } = await import('../dist/src/verification-claim.js');
  const { deliverClaim } = await import('../dist/src/verification-outbox.js');
  const ids = [];
  for (const recipient of [address(), address()]) {
    await recovery.request('register', recipient);
    ids.push((await db.verificationOutbox.findFirstOrThrow({where:{recipient}})).id);
  }
  const lock = await database.pool.connect();
  try {
    await lock.query('BEGIN');
    await lock.query('SELECT id FROM verification_outbox WHERE id=$1 FOR UPDATE', [ids[0]]);
    assert.equal(await claimOne(database, ids[0]), 'empty');
    const other = await claimOne(database, ids[1]); assert.equal(other.id, ids[1]);
  } finally { await lock.query('ROLLBACK'); lock.release(); }
  const a = await claimOne(database, ids[0]);
  assert.equal(await claimOne(database, ids[0]), 'empty');
  await db.$executeRaw`UPDATE verification_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${a.id}::uuid`;
  const b = await claimOne(database, ids[0]); assert.notEqual(a.claim_id,b.claim_id);
  let sent = 0; const delivery = { async send() { sent++; } };
  assert.equal(await deliverClaim(database, delivery, a), 'stale');
  assert.equal(await deliverClaim(database, delivery, b), 'accepted');
  assert.equal(sent, 1);
});

test('an expired sender cannot record success, release the gate, or trigger a replay', async t => {
  const { database, db, recovery, address, dispatch } = await fixture(t);
  const email = address(); await recovery.request('register', email);
  const { id } = await db.verificationOutbox.findFirstOrThrow({where:{recipient:email}});
  let attempts = 0;
  const result = await sendOne(database, { async send() {
    attempts++;
    assert.equal(await dispatch(id), 'busy');
    await db.$executeRaw`UPDATE verification_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${id}::uuid`;
    assert.equal(await dispatch(id), 'paused');
  } }, id);
  assert.equal(result,'lost-after-send');
  assert.equal(await dispatch(id),'paused'); assert.equal(attempts,1);
  assert.equal((await db.verificationOutbox.findUniqueOrThrow({where:{id}})).status,'attempting');
  assert.equal((await db.verificationMailControl.findUniqueOrThrow({where:{id:1}})).pausedBy,id);
});

test('the preparation check uses the clock after waiting for the intent lock', async t => {
  const { database, db, recovery, address } = await fixture(t);
  const { claimOne } = await import('../dist/src/verification-claim.js');
  const { deliverClaim } = await import('../dist/src/verification-outbox.js');
  const recipient = address(); await recovery.request('register', recipient);
  const job = await db.verificationOutbox.findFirstOrThrow({ where: { recipient } });
  const claim = await claimOne(database, job.id);
  const lock = await database.pool.connect();
  let result, sends = 0;
  try {
    await lock.query('BEGIN');
    await lock.query('SELECT id FROM public.verification_intents WHERE id=$1 FOR UPDATE', [job.intentId]);
    await db.$executeRaw`UPDATE public.verification_outbox SET lease_until=clock_timestamp()+interval '1.2 seconds'
      WHERE id=${job.id}::uuid`;
    result = deliverClaim(database, {async send() { sends++; }}, claim);
    // This session really blocks the preparing transaction, while its lease is still live.
    for (let n=0; ; n++) {
      const {rows} = await lock.query(`SELECT EXISTS (SELECT FROM pg_stat_activity a
        WHERE pg_backend_pid()=ANY(pg_blocking_pids(a.pid))) AS blocked,
        lease_until>clock_timestamp() AS live FROM verification_outbox WHERE id=$1`, [job.id]);
      if (rows[0].blocked) { assert.equal(rows[0].live, true); break; }
      assert(n<80); await new Promise(r=>setTimeout(r,10));
    }
    await lock.query('SELECT pg_sleep(GREATEST(0,extract(epoch from lease_until-clock_timestamp()))::float8 + 0.05) FROM verification_outbox WHERE id=$1',[job.id]);
  } finally { await lock.query('ROLLBACK'); lock.release(); }
  assert.equal(await result, 'stale'); assert.equal(sends,0);
  assert.equal((await db.verificationIntent.findUniqueOrThrow({where:{id:job.intentId}})).tokenDigest,job.generation);
});

test('parallel reservations release only their own job when the SMTP channel becomes busy', async t => {
  const { database, db, recovery, address } = await fixture(t);
  const { claimOne } = await import('../dist/src/verification-claim.js');
  const { deliverClaim } = await import('../dist/src/verification-outbox.js');
  const claims = [];
  for (const recipient of [address(), address()]) {
    await recovery.request('register', recipient);
    const { id } = await db.verificationOutbox.findFirstOrThrow({ where: { recipient } });
    claims.push(await claimOne(database,id));
  }
  const [a,b] = claims;
  let wrongSend = 0;
  const other = {async send() { wrongSend++; }};
  assert.equal(await deliverClaim(database, {async send() {
    assert.equal(await deliverClaim(database, other, {...b, claim_id:randomUUID()}),'busy');
    assert.equal((await db.verificationOutbox.findUniqueOrThrow({where:{id:b.id}})).claimId,b.claim_id);
    assert.equal(await deliverClaim(database, other, b),'busy');
    const row=await db.verificationOutbox.findUniqueOrThrow({where:{id:b.id}});
    assert.equal(row.status,'pending'); assert.equal(row.claimId,null); assert.equal(row.leaseUntil,null);
  }}, a),'accepted');
  assert.equal(wrongSend,0);
  assert.equal(await sendOne(database,other,b.id),'accepted'); assert.equal(wrongSend,1);
});

test('a retry rechecks the exact prepared intent, including replacement during backoff', async t => {
  let fail = true;
  const tokens = [];
  const deferred = Object.assign(new Error(), { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 450 });
  const { recovery, db, address, dispatch } = await fixture(t, { async send(email, purpose, token) {
    if (fail) throw deferred;
    tokens.push(token);
  } });
  for (const replace of [false, true]) {
    fail = true;
    const recipient = address();
    await recovery.request('register', recipient);
    const { id, intentId } = await db.verificationOutbox.findFirstOrThrow({ where: { recipient } });
    assert.equal(await dispatch(id), 'retry-scheduled');
    assert.equal(await dispatch(id), 'empty');
    if (replace) {
      await db.verificationIntent.update({ where: { id: intentId }, data: { issuedAt: new Date(Date.now()-61000) } });
      await recovery.request('register', recipient);
    }
    await db.verificationOutbox.update({ where: { id }, data: { availableAt: new Date(0) } });
    fail = false;
    assert.equal(await dispatch(id), replace ? 'obsolete' : 'accepted');
    if (!replace) await recovery.confirm('register', { token: tokens[0], newPassword: password });
    const row = await db.verificationOutbox.findUniqueOrThrow({ where: { id } });
    assert.equal(row.attempts, replace ? 1 : 2);
  }
});

test('registration and reset confirmations enqueue once each, including a registration without Web access', async t => {
  const { register, recovery, db, issue } = await fixture(t);
  const user = await register();
  const token = await issue('reset', user.email);
  await recovery.confirm('reset', { token, newPassword: nextPassword });
  await assert.rejects(recovery.confirm('reset', { token, newPassword: nextPassword }), invalid);
  assert.deepEqual(await db.notificationJob.findMany({ where: { userId: user.userId }, orderBy: {kind:'asc'},
    select: {action:true,kind:true,status:true} }), ['password-reset','registered'].map(kind => ({
    action:'notification.create', kind, status:'pending',
  })));
  assert.equal(await db.notification.count({ where:{userId:user.userId} }),0);
});
