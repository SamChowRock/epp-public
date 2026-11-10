import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import sharp from 'sharp';

const mode = process.argv[2];
assert(['normal', 'slow', 'abort', 'race', 'timeout', 'hold'].includes(mode),
  '选择 normal、slow、abort、race、timeout 或 hold');
const base = new URL(process.env.AVATAR_BASE_URL ?? 'http://127.0.0.1:3360');
assert(base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname)
  && !base.username && !base.password, '需要使用本机回环 HTTP 地址');
const { AVATAR_EMAIL: email, AVATAR_USER_ID: userId } = process.env;
assert(email || userId, '请设置 AVATAR_EMAIL（旧账号可用 AVATAR_USER_ID）');
const label = `avatar-${mode}-${randomUUID()}`;

async function readPassword() {
  assert(!process.stdin.isTTY, '请用配套说明的 Bash 函数从管道传入密码');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    assert(bytes <= 1024, '密码输入超过 1024 字节');
    chunks.push(chunk);
  }
  assert(bytes > 0, '密码输入为空');
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
}
const data = await readFile(new URL('harbor.png', import.meta.url));
const path = '/profile/avatar/preview';
const auth = { 'X-EPP-Request': '1' };

async function api(route, options, expected) {
  const response = await fetch(new URL(route, base), {
    ...options, redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { ...auth, ...options.headers },
  });
  if (response.status !== expected) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(`${route} HTTP ${response.status} ${problem.code ?? ''} Retry-After=${response.headers.get('Retry-After') ?? '-'}`);
  }
  return response;
}

// Leave the body open after its first chunk. The caller controls the next action.
function begin() {
  const req = http.request(new URL(path, base), {
    method: 'POST', headers: { ...auth, 'Content-Type': 'image/png' },
  });
  const result = new Promise((resolve, reject) => {
    req.once('error', reject);
    req.once('response', (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.once('error', reject);
      res.once('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
  });
  // An early server error can arrive while the caller is sleeping.
  result.catch(() => {});
  req.setTimeout(16000, () => req.destroy(new Error('客户端等待超过 16 秒')));
  req.write(data.subarray(0, 32));
  return { req, result };
}

async function checkPreview(result) {
  const { status, body } = await result;
  assert.equal(status, 200);
  const { format, width, height } = await sharp(body).metadata();
  assert.deepEqual([format, width, height], ['webp', 256, 256]);
  await sharp(body).raw().toBuffer();
  console.log(`HTTP 200 · WebP ${width}×${height} · ${body.length} 字节`);
}

async function completeOne() {
  const { req, result } = begin();
  req.end(data.subarray(32));
  await checkPreview(result);
}

async function observeStop(result) {
  try {
    const response = await result;
    const { code } = JSON.parse(response.body);
    if (response.status === 503 && code === 'SERVICE_DRAINING') {
      console.log('HTTP 503 SERVICE_DRAINING；请核对 API 退出状态与本次临时目录');
      return;
    }
    assert.equal(response.status, 408);
    assert.equal(code, 'UPLOAD_TIMEOUT');
    console.log('HTTP 408 UPLOAD_TIMEOUT；本次错过了发送停机信号的接收窗口');
  } catch (error) {
    if (!['ECONNRESET', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code)) throw error;
    console.log(`未收到完整响应（${error.code}）；请核对 API 是否仍在运行及本次临时文件`);
  }
}

async function run() {
  if (mode === 'normal') return completeOne();
  if (mode === 'race') {
    const three = Array.from({ length: 3 }, begin);
    try {
      const first = await Promise.race(three.map(async (item) => ({ item, ...await item.result })));
      assert.equal(first.status, 429);
      assert.equal(JSON.parse(first.body).code, 'AVATAR_BUSY');
      console.log('三个请求各送 32 字节并停住，其中一个收到 429 AVATAR_BUSY');
      first.item.req.destroy();
      const accepted = three.filter((item) => item !== first.item);
      for (const { req } of accepted) req.end(data.subarray(32));
      await Promise.all(accepted.map(({ result }) => checkPreview(result)));
    } finally {
      for (const { req } of three) req.destroy();
    }
    return completeOne();
  }

  const { req, result } = begin();
  try {
    console.log('已写出前 32 字节，请求仍打开');
    if (mode === 'hold') return await observeStop(result);
    if (mode === 'slow') {
      const step = Math.ceil((data.length - 32) / 6);
      for (let start = 32; start < data.length; start += step) {
        await sleep(500);
        req.write(data.subarray(start, start + step));
      }
      req.end();
      return await checkPreview(result);
    }
    if (mode === 'abort') {
      await sleep(800);
      req.destroy();
      await assert.rejects(result, { code: 'ECONNRESET' });
      console.log('客户端主动断开；用新请求检查 API');
    } else {
      console.log('保持连接，等待 API 接收期限');
      const response = await result;
      assert.equal(response.status, 408);
      assert.equal(JSON.parse(response.body).code, 'UPLOAD_TIMEOUT');
      console.log('HTTP 408 UPLOAD_TIMEOUT');
    }
  } finally {
    req.destroy();
  }
  await completeOne();
}

const password = await readPassword();
const identity = email ? { email } : { userId };
const login = await api('/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...identity, password, label }),
}, 200);
await login.arrayBuffer();
const cookie = login.headers.getSetCookie()[0];
assert(cookie, '登录响应应设置会话 Cookie');
auth.Cookie = cookie.split(';', 1)[0];
if (mode === 'hold') console.log(`本轮会话 label：${label}`);
try {
  const token = await (await api('/auth/csrf', {}, 200)).json();
  auth['X-CSRF-Token'] = token.csrfToken;
  const before = await (await api('/profile/me', {}, 200)).json();
  await run();
  if (mode !== 'hold') {
    assert.deepEqual(await (await api('/profile/me', {}, 200)).json(), before);
    console.log('同一会话的本人资料与开始时一致');
  }
} finally {
  // If the crash experiment has stopped the API, let the original network error surface.
  await api('/auth/logout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  }, 204).catch(() => console.warn(`本轮注销未获确认，可在 API 恢复后通过会话列表查找并撤销 ${label}`));
}
