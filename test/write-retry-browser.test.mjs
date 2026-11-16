import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingWrite, STORAGE_KEY } from '../examples/write-retry/pending.mjs';
const key = '11111111-1111-4111-8111-111111111111';
function setup(options = {}) {
  const memory = new Map();
  const sent = [];
  let identity = { userId: 'a', sessionId: 's1' };
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v), removeItem: k => memory.delete(k) };
  const args = { storage, identify: async () => identity, uuid: () => key,
    send: async record => { sent.push(structuredClone(record)); throw Error('connection lost'); }, ...options };
  return { model: new PendingWrite(args), args, memory, sent, setIdentity: x => { identity = x; } };
}
test('persist before sending; refresh retries exact original key, path and bytes', async () => {
  const x = setup(); await x.model.initialize();
  await x.model.submit('/captures', { originalText: '  first  ', chineseIntent: null });
  assert.equal(x.sent.length, 1); assert.ok(x.memory.has(STORAGE_KEY));
  const refreshed = new PendingWrite(x.args); await refreshed.initialize();
  assert.equal(refreshed.state.pending.operationId, key);
  await refreshed.retry(); assert.deepEqual(x.sent[1], x.sent[0]);
});
test('storage failure prevents network write', async () => {
  const x = setup({ storage: { getItem: () => null, setItem: () => { throw Error('quota'); }, removeItem: () => {} } });
  await x.model.initialize(); await x.model.submit('/captures', { originalText: 'a' });
  assert.equal(x.sent.length, 0); assert.equal(x.model.state.phase, 'storage-error');
});
test('different session after refresh destroys pending without exposing its body', async () => {
  const x = setup(); await x.model.initialize(); await x.model.submit('/captures', { originalText: 'secret' });
  x.setIdentity({ userId: 'a', sessionId: 's2' });
  const refreshed = new PendingWrite(x.args); await refreshed.initialize();
  assert.equal(refreshed.state.pending, null); assert.equal(x.memory.size, 0);
});
test('identity changes before retry clear pending and do not send', async () => {
  const x = setup(); await x.model.initialize(); await x.model.submit('/captures', { originalText: 'secret' });
  x.setIdentity({ userId: 'b', sessionId: 's2' }); await x.model.retry();
  assert.equal(x.sent.length, 1); assert.equal(x.model.state.pending, null);
});
test('logout during an in-flight write suppresses late successful result', async () => {
  let resolve; const x = setup({ send: () => new Promise(r => { resolve = r; }) });
  await x.model.initialize(); const sending = x.model.submit('/captures', { originalText: 'secret' });
  while (!resolve) await new Promise(r => setImmediate(r));
  x.model.clearIdentity(); resolve({ id: 'old', originalText: 'secret' }); await sending;
  assert.equal(x.model.state.result, null); assert.equal(x.model.state.pending, null); assert.equal(x.memory.size, 0);
});
test('malformed success body keeps the operation for retry', async () => {
  const x = setup({ send: async () => { throw new SyntaxError('bad JSON'); } });
  await x.model.initialize(); await x.model.submit('/captures', { originalText: 'a' });
  assert.equal(x.model.state.phase, 'uncertain'); assert.ok(x.memory.has(STORAGE_KEY));
});
test('valid success clears record; a new submission gets a new intent', async () => {
  const x = setup({ send: async () => ({ id: 'capture' }) }); await x.model.initialize();
  await x.model.submit('/captures', { originalText: 'a' });
  assert.equal(x.memory.size, 0); assert.equal(x.model.state.result.id, 'capture');
});

test('proxy loses first success after upstream body ends; retry forwards original key/body', async () => {
  const http = await import('node:http');
  const { createPracticeServer } = await import('../examples/write-retry/server.mjs');
  const requests = []; let ended = false;
  const upstream = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, body, key: req.headers['idempotency-key'], origin: req.headers.origin, expectedSession: req.headers['x-expected-session'], eppRequest: req.headers['x-epp-request'] });
    res.writeHead(201, { 'Content-Type': 'application/json', Location: '/captures/example' });
    res.write('{"id":');
    setTimeout(() => { ended = true; res.end('"example"}'); }, 20);
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const proxy = createPracticeServer({ targetPort: upstream.address().port, dropSuccessOnce: true });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  const options = { method: 'POST', headers: { 'Idempotency-Key': key, Origin: origin, 'X-Expected-Session': 's1', 'X-EPP-Request': '1' }, body: '{"originalText":"same"}' };
  try {
    await assert.rejects(async () => {
      const interrupted = await fetch(`${origin}/captures`, options);
      await interrupted.json();
    });
    assert.equal(ended, true); assert.equal(requests.length, 1);
    const retry = await fetch(`${origin}/captures`, options);
    assert.equal(retry.status, 201); assert.equal(retry.headers.get('location'), '/captures/example');
    assert.deepEqual(await retry.json(), { id: 'example' }); assert.deepEqual(requests[0], requests[1]);
    assert.equal(requests[0].origin, origin); assert.equal(requests[0].expectedSession, 's1'); assert.equal(requests[0].eppRequest, '1');
    const refused = await fetch(`${origin}/http://example.com/`); assert.equal(refused.status, 404);
  } finally { proxy.closeAllConnections(); upstream.closeAllConnections(); await Promise.all([new Promise(r => proxy.close(r)), new Promise(r => upstream.close(r))]); }
});

test('two immediate submits create only one operation', async () => {
  const x = setup(); await x.model.initialize();
  await Promise.all([x.model.submit('/captures', { originalText: 'one' }), x.model.submit('/captures', { originalText: 'two' })]);
  assert.equal(x.sent.length, 1);
});

test('expiry clears pending and aborts local delivery; rejected writes otherwise preserve intent', async () => {
  const expired = setup({ send: async () => { const error = Error('expired'); error.status = 401; throw error; } });
  await expired.model.initialize(); await expired.model.submit('/captures', { originalText: 'secret' });
  assert.equal(expired.model.state.owner, null); assert.equal(expired.memory.size, 0);
  const conflict = setup({ send: async () => { const error = Error('conflict'); error.status = 409; throw error; } });
  await conflict.model.initialize(); await conflict.model.submit('/captures', { originalText: 'a' });
  assert.equal(conflict.model.state.pending.operationId, key); assert.ok(conflict.memory.has(STORAGE_KEY));
});
test('logout while preparing write headers invalidates the sender before it can send', async () => {
  let release; let started; let delivered = 0;
  const prepared = new Promise(r => { started = r; });
  const x = setup({ send: async (_record, { isCurrent, signal }) => {
    started(); await new Promise(r => { release = r; });
    assert.equal(signal.aborted, true);
    if (!isCurrent()) throw Error('cancelled');
    delivered++; return { id: 'should-never-be-visible' };
  } });
  await x.model.initialize(); const pending = x.model.submit('/captures', { originalText: 'secret' });
  await prepared; x.model.clearIdentity(); release(); await pending;
  assert.equal(delivered, 0); assert.equal(x.model.state.result, null);
});

test('session header binds to saved owner even if the cookie changes while fetching CSRF', async () => {
  const { sendPendingWrite } = await import('../examples/write-retry/pending.mjs');
  const calls = []; let cookie = 'session-a';
  const x = setup({ send: (record, context) => sendPendingWrite(record, { ...context,
    sessionMode: true, csrfMode: true, request: async (path, options) => {
      if (path === '/auth/csrf') { cookie = 'session-b'; return { csrfToken: 'token-b' }; }
      calls.push({ path, options, cookie });
      const error = Error('session changed'); error.status = 403; throw error;
    },
  }) });
  await x.model.initialize(); await x.model.submit('/captures', { originalText: 'only a' });
  assert.equal(calls[0].options.headers['X-Expected-Session'], 's1');
  assert.equal(calls[0].options.headers['X-CSRF-Token'], 'token-b');
  assert.equal(calls[0].options.headers['X-EPP-Request'], '1');
  assert.equal(calls[0].cookie, 'session-b');
  assert.ok(x.memory.has(STORAGE_KEY));
  x.setIdentity({ userId: 'b', sessionId: 's2' }); await x.model.retry();
  assert.equal(calls.length, 1); assert.equal(x.model.state.pending, null);
});
test('success JSON with an invalid schema never clears the persisted operation', async () => {
  const { sendPendingWrite } = await import('../examples/write-retry/pending.mjs');
  assert.equal(typeof sendPendingWrite, 'function');
  for (const result of [
    { id: key, originalText: 'a', chineseIntent: 7, createdAt: '2026-11-16T00:00:00.000Z' },
    { id: key, originalText: 'a', chineseIntent: null },
    { id: key, originalText: 'a', chineseIntent: null, createdAt: 'not a date' },
  ]) {
    const x = setup({ send: (record, context) => sendPendingWrite(record, {
      ...context, sessionMode: false, csrfMode: false, request: async () => result,
    }) });
    await x.model.initialize(); await x.model.submit('/captures', { originalText: 'a' });
    assert.ok(x.memory.has(STORAGE_KEY)); assert.equal(x.model.state.result, null);
    assert.equal(x.model.state.phase, 'uncertain');
  }
});
test('valid create and revision response schemas clear their matching operations', async () => {
  const { sendPendingWrite } = await import('../examples/write-retry/pending.mjs');
  const base = { id: key, originalText: 'a', chineseIntent: null, createdAt: '2026-11-16T00:00:00.000Z' };
  for (const [path, result] of [['/captures', base], [`/captures/${key}/revisions`, {
    ...base, captureId: key, revisionNo: 2, inputSource: 'manual', chunks: [{ text: 'a' }],
  }]]) {
    const x = setup({ send: (record, context) => sendPendingWrite(record, {
      ...context, sessionMode: true, csrfMode: false, request: async (_path, options) => {
        assert.equal(options.expectedStatus, 201); assert.equal(options.headers['X-Expected-Session'], 's1'); return result;
      },
    }) });
    await x.model.initialize(); await x.model.submit(path, { originalText: 'a', chineseIntent: null });
    assert.equal(x.memory.size, 0); assert.deepEqual(x.model.state.result, result);
  }
});
test('storage blocked during refresh leaves stored operation intact and invisible', async () => {
  const x = setup(); await x.model.initialize(); await x.model.submit('/captures', { originalText: 'secret' });
  const refreshed = new PendingWrite({ ...x.args, storage: { ...x.args.storage, getItem: () => { throw Error('blocked'); } } });
  await refreshed.initialize();
  assert.equal(refreshed.state.pending, null); assert.equal(refreshed.state.phase, 'unavailable');
  assert.ok(x.memory.has(STORAGE_KEY)); assert.equal(x.sent.length, 1);
});

test('a rejected late response rechecks identity before exposing the old pending body', async () => {
  const x = setup({ send: async () => {
    x.setIdentity({ userId: 'b', sessionId: 's2' });
    const error = Error('session mismatch'); error.status = 403; throw error;
  } });
  await x.model.initialize(); await x.model.submit('/captures', { originalText: 'only a' });
  assert.equal(x.model.state.pending, null); assert.equal(x.model.state.result, null);
  assert.equal(x.memory.size, 0); assert.equal(x.model.state.phase, 'identity-changed');
});

test('identity change with blocked removal keeps storage-error and prevents a new write', async () => {
  const x = setup(); await x.model.initialize(); await x.model.submit('/captures', { originalText: 'secret' });
  x.args.storage.removeItem = () => { throw Error('storage blocked'); };
  x.setIdentity({ userId: 'b', sessionId: 's2' }); await x.model.retry();
  assert.equal(x.model.state.phase, 'storage-error'); assert.equal(x.model.state.owner, null);
  assert.equal(x.model.state.pending, null); assert.ok(x.memory.has(STORAGE_KEY));
  await x.model.submit('/captures', { originalText: 'new b' }); assert.equal(x.sent.length, 1);
  assert.equal(await x.model.verifyIdentity(), false);
  await x.model.submit('/captures', { originalText: 'still blocked' }); assert.equal(x.sent.length, 1);
});
test('focus identity verification preserves an in-flight write under the same owner', async () => {
  let finish; let context;
  const x = setup({ send: async (_record, ctx) => { context = ctx; return new Promise(r => { finish = r; }); } });
  await x.model.initialize(); const sending = x.model.submit('/captures', { originalText: 'a' });
  while (!finish) await new Promise(r => setImmediate(r));
  assert.equal(await x.model.verifyIdentity(), true);
  assert.equal(x.model.state.phase, 'sending'); assert.equal(context.signal.aborted, false);
  finish({ id: 'capture' }); await sending; assert.equal(x.model.state.phase, 'success');
});
test('focus confirms changed identity without revealing the prior pending record', async () => {
  const x = setup(); await x.model.initialize(); await x.model.submit('/captures', { originalText: 'secret' });
  x.setIdentity({ userId: 'b', sessionId: 's2' });
  assert.equal(await x.model.verifyIdentity(), true);
  assert.equal(x.model.state.phase, 'identity-changed'); assert.equal(x.model.state.pending, null);
});
