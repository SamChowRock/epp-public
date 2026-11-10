import './database-env.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';
import sharp from 'sharp';
import { createApp } from '../dist/src/app.js';
import { sessionFetch } from './session-fixture.mjs';

const png = await readFile(new URL('../examples/avatar-preview/harbor.png', import.meta.url));
const jpeg = await readFile(new URL('../examples/avatar-preview/harbor.jpg', import.meta.url));
// A valid two-frame 2×2 APNG, small enough to pass every dimensional limit.
const animated = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNU' +
  'TAAAAAAAAAACAAAAAgAAAAAAAAAAAAEAFAAA/uxSegAAABBJREFUeJxj/M8AAkxgkgEADR0BA4LJcf8A' +
  'AAAaZmNUTAAAAAEAAAACAAAAAgAAAAAAAAAAAAEAFAAAZZ+4rgAAABZmZEFUAAAAAnicY2Rg+M/AwMDEA' +
  'AYACx8BAyVgX34AAAAASUVORK5CYII=', 'base64');

async function fixture(t) {
  const app = await createApp();
  const authorized = await sessionFetch(t, app);
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const endpoint = base + '/profile/avatar/preview';
  function post(body, type = 'image/png', options = {}) {
    return authorized(endpoint, { method: 'POST', headers: { 'Content-Type': type }, body, ...options });
  }
  return { base, endpoint, post, authorized };
}

test('a JPEG or PNG returns a square metadata-free WebP and preserves the profile', async t => {
  const { base, authorized, post } = await fixture(t);
  const profile = async () => (await authorized(base + '/profile/me')).json();
  const before = await profile();
  const tagged = await sharp(jpeg).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  for (const [body, type] of [[tagged, 'image/jpeg'], [png, 'image/png']]) {
    const res = await post(body, type);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/webp');
    assert.match(res.headers.get('cache-control'), /no-store/);
    const out = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    assert.deepEqual([out.format, out.width, out.height], ['webp', 256, 256]);
    assert.equal(out.exif, undefined);
    assert.equal(out.icc, undefined);
  }
  assert.deepEqual(await profile(), before);
});

test('preview enforces the existing session and CSRF boundary', async t => {
  const { authorized, endpoint } = await fixture(t);
  const headers = { 'Content-Type': 'image/png', 'X-EPP-Request': '1' };
  const send = () => fetch(endpoint, { method: 'POST', headers, body: png });
  assert.equal((await send()).status, 401);
  headers.Cookie = authorized.cookie;
  assert.equal((await send()).status, 403);
});

test('format, frame, dimension and decode checks reject unsafe input; the next preview succeeds', async t => {
  const { post } = await fixture(t);
  async function solid(width, height) {
    return sharp({ create: { width, height, channels: 3, background: '#222' } }).png().toBuffer();
  }
  for (const [body, type, status] of [
    [png, 'text/plain', 415], [jpeg, 'image/png', 415], [png.subarray(0, 40), 'image/png', 422],
    [animated, 'image/png', 422], [Buffer.concat([jpeg, jpeg]), 'image/jpeg', 422],
    [await solid(8193, 1), 'image/png', 422],
    [await solid(4001, 3000), 'image/png', 422],
  ]) {
    assert.equal((await post(body, type)).status, status);
  }
  assert.equal((await post(png)).status, 200);
});

test('chunked requests cannot bypass the 2 MiB input limit', async t => {
  const { post } = await fixture(t);
  async function* chunks() {
    yield png;
    for (let i = 0; i < 32; i++) yield Buffer.alloc(64 * 1024);
  }
  const response = await post(chunks(), 'image/png', { duplex: 'half' });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'AVATAR_TOO_LARGE');
  assert.equal((await post(png)).status, 200);
});

async function slowSender(t, { base, endpoint, authorized }) {
  const { csrfToken } = await (await authorized(base + '/auth/csrf')).json();
  const headers = { Cookie: authorized.cookie, 'X-EPP-Request': '1',
    'X-CSRF-Token': csrfToken, 'Content-Type': 'image/png' };
  return () => {
    const request = http.request(endpoint, { method: 'POST', headers });
    const result = new Promise((resolve, reject) => {
      request.once('error', reject);
      request.once('response', async response => {
        try {
          const chunks = [];
          for await (const chunk of response) chunks.push(chunk);
          resolve({ status: response.statusCode, body: Buffer.concat(chunks) });
        } catch (error) { reject(error); }
      });
    });
    result.catch(() => {}); // An intentionally disconnected sender has no response.
    request.setTimeout(15_000, () => request.destroy(new Error('Test client deadline')));
    t.after(() => request.destroy());
    request.write(png.subarray(0, 32));
    return { request, result };
  };
}

test('two in-flight previews own both slots, a client abort releases its slot', async t => {
  const context = await fixture(t);
  const begin = await slowSender(t, context);
  const senders = Array.from({ length: 3 }, begin);
  const first = await Promise.race(senders.map(async sender => ({ sender, ...await sender.result })));
  assert.equal(first.status, 429);
  assert.equal(JSON.parse(first.body).code, 'AVATAR_BUSY');
  first.sender.request.destroy();
  const [aborted, open] = senders.filter(sender => sender !== first.sender);
  aborted.request.destroy();
  // A retry can arrive before the server observes the disconnected socket.
  let status = 429;
  for (let i = 0; i < 50 && status === 429; i++) {
    const response = await context.post(png);
    status = response.status;
    await response.arrayBuffer();
  }
  assert.equal(status, 200);
  open.request.end(png.subarray(32));
  assert.equal((await open.result).status, 200);
});

test('small periodic chunks cannot extend the absolute receive deadline', async t => {
  const context = await fixture(t);
  const begin = await slowSender(t, context);
  const { request, result } = begin();
  const keepWriting = setInterval(() => request.write(Buffer.from([0])), 330);
  try {
    const response = await result;
    assert.equal(response.status, 408);
    assert.equal(JSON.parse(response.body).code, 'UPLOAD_TIMEOUT');
  } finally {
    clearInterval(keepWriting);
    request.destroy();
  }
  assert.equal((await context.post(png)).status, 200);
});
