// Independent VERIFY exercise: the application never accepts a client-supplied OpenID.
import '../test/database-env.mjs';
import { createInterface } from 'node:readline/promises';
import { writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp } from '../dist/src/app.js';
import { parseConfig } from '../dist/src/config.js';
import { AppLogger } from '../dist/src/app-logger.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { SessionService } from '../dist/src/session.service.js';
import { MiniService } from '../dist/src/mini.service.js';
import { ApplicationState } from '../dist/src/application-state.js';
import { hashPassword } from '../dist/src/password.js';
import { removeTestCaptures } from '../test/cleanup.mjs';
const file = new URL('../.mini-local.postman_environment.json', import.meta.url);
const config = parseConfig({ port: 3370 }, { NODE_ENV: 'test', PORT: process.env.PORT ?? '3370', LOG_LEVEL: 'warn' });
const app = await createApp(config, new AppLogger('warn'));
const database = app.get(DatabaseService), db = database.client, sessions = app.get(SessionService);
const userId = randomUUID(), otherUserId = randomUUID(), ids = [userId, otherUserId];
const password = 'Fictional local chapter 37 password';
let terminal;
try {
  const passwordHash = await hashPassword(password);
  for (const id of ids) await db.user.create({ data: { id, webEnabled: true, miniEnabled: true,
    passwordCredential: { create: { passwordHash } } } });
  await app.listen(config.port, '127.0.0.1'); const baseUrl = await app.getUrl();
  const web = await sessions.login({ userId, password, label: 'Web before linking' });
  const cookie = 'epp_session=' + web.token;
  const csrf = await fetch(baseUrl + '/auth/csrf', { headers: { Cookie: cookie } }).then(r => r.json());
  const created = await fetch(baseUrl + '/captures', { method: 'POST', headers: { Cookie: cookie,
    'X-EPP-Request': '1', 'X-CSRF-Token': csrf.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalText: 'This record existed before linking.' }) });
  assert.equal(created.status, 201); const capture = await created.json();
  const mini = new MiniService(database, sessions, app.get(ApplicationState), {
    async exchange(code) { return { appId: 'wx0000000000000037', openId: code }; },
  });
  const own = await mini.link({ code: randomUUID(), userId, password, label: 'Local mini exercise' });
  const other = await mini.link({ code: randomUUID(), userId: otherUserId, password, label: 'Local other exercise' });
  const read = await fetch(baseUrl + '/captures/' + capture.id, { headers: { Authorization: 'Bearer ' + own.token } });
  assert.equal(read.status, 200); assert.deepEqual(await read.json(), capture);
  const foreign = await fetch(baseUrl + '/captures/' + capture.id, { headers: { Authorization: 'Bearer ' + other.token } });
  assert.equal(foreign.status, 404);
  const values = { baseUrl, miniToken: own.token, otherMiniToken: other.token, userId, otherUserId,
    captureId: capture.id, miniSessionId: own.sessionId, code: '', password: '', label: 'Mini program' };
  await writeFile(file, JSON.stringify({ name: 'EPP 37 local VERIFY only', values: Object.entries(values).map(([key,value]) =>
    ({ key, value, enabled: true, type: /Token|password/.test(key) ? 'secret' : 'default' })), _postman_variable_scope: 'environment' }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ userId, otherUserId, captureId: capture.id, ownRead: read.status, foreignRead: foreign.status,
    environmentFile: '.mini-local.postman_environment.json', platformExchange: 'local replacement, not WeChat' }, null, 2));
  terminal = createInterface({ input: process.stdin, output: process.stdout });
  await terminal.question('Import into an unsynchronized Postman workspace; press Return after observations to revoke and remove this exercise.\n');
} finally {
  terminal?.close();
  try {
    const captures = await db.capture.findMany({ where: { userId: { in: ids } }, select: { id: true } });
    await removeTestCaptures(db, captures.map(x => x.id), new Set());
    await db.wechatIdentity.deleteMany({ where: { userId: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.passwordCredential.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await rm(file, { force: true });
  } finally { await app.close(); }
}
