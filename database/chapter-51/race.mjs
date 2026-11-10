import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { withVerifiedDatabase } from '../../scripts/verify-database.mjs';

const [databaseName, userId, origin = 'http://127.0.0.1:3360', ...extra] = process.argv.slice(2);
if (extra.length || !databaseName || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(userId ?? '')
    || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || process.stdin.isTTY) {
  throw Error('Usage: pass the password on stdin; race.mjs EXPECTED_DATABASE USER_ID [http://127.0.0.1:PORT]');
}
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 1024) throw Error('Password input exceeds the local limit');
  chunks.push(chunk);
}
if (!size) throw Error('Missing password on stdin');
const password = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
const png = await readFile(new URL('../../examples/avatar-preview/harbor.png', import.meta.url));
const jpeg = await readFile(new URL('../../examples/avatar-preview/harbor.jpg', import.meta.url));
const headers = { 'X-EPP-Request': '1' };
async function api(path, method, contentType, body) {
  const res = await fetch(origin + path, { method, redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: contentType ? { ...headers, 'Content-Type': contentType } : headers, body });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw Error(`${path} HTTP ${res.status} ${detail.code ?? ''}`);
  }
  return res;
}

// Hold A before EOF. B begins only after an independent DB connection sees A's reservation.
async function compete(db) {
  const active = () => db.query("SELECT id FROM avatar_writes WHERE user_id=$1 AND state='writing'", [userId]);
  assert.equal((await active()).rowCount, 0, 'Use a quiet practice account without an outstanding reservation');
  const a = http.request(origin + '/profile/avatar', { method: 'POST', headers: { ...headers, 'Content-Type': 'image/png' } });
  const answer = new Promise((resolve, reject) => {
    a.on('error', reject);
    a.on('response', async response => {
      try {
        const parts = [];
        for await (const chunk of response) parts.push(chunk);
        resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(parts).toString('utf8')) });
      } catch (error) { reject(error); }
    });
  });
  answer.catch(() => {});
  a.setTimeout(18_000, () => a.destroy(Error('Test client deadline')));
  try {
    a.write(png.subarray(0, 32));
    let reserved;
    for (let tries = 0; tries < 100 && !reserved; tries++) {
      reserved = (await active()).rows[0];
      if (!reserved) await delay(35);
    }
    assert.ok(reserved, 'No reservation observed; confirm API/database target, account, storage and upload capacity');
    const b = await (await api('/profile/avatar', 'POST', 'image/jpeg', jpeg)).json();
    a.end(png.subarray(32));
    const late = await answer;
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'AVATAR_SUPERSEDED');
    const { rows: [user] } = await db.query('SELECT avatar_id FROM users WHERE id=$1', [userId]);
    assert.equal(user.avatar_id, b.avatarId);
    assert.notEqual(user.avatar_id, reserved.id);
    console.log('A', reserved.id, late.status, late.body.code);
    console.log('B', b.avatarId, '200; current reference verified');
  } finally { a.destroy(); }
}

await withVerifiedDatabase(databaseName, async db => {
  const login = await api('/auth/login', 'POST', 'application/json', JSON.stringify({ userId, password, label: 'Avatar race' }));
  const identity = await login.json();
  assert.equal(identity.userId, userId);
  headers.Cookie = login.headers.getSetCookie()[0].split(';')[0];
  headers['X-CSRF-Token'] = (await (await api('/auth/csrf', 'GET')).json()).csrfToken;
  try {
    // A fresh session ID must exist on this connection before either upload can change data.
    assert.equal((await db.query('SELECT id FROM sessions WHERE user_id=$1 AND id=$2', [userId, identity.sessionId])).rowCount, 1,
      'API and SQL must use the same VERIFY');
    await compete(db);
  } finally { await api('/auth/logout', 'POST', 'application/json', '{}'); }
});
