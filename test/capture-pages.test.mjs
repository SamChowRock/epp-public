import { sessionFetch } from './session-fixture.mjs';
import './auth-rate-test-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { loadConfig } from '../dist/src/config.js';
import { CapturePages } from '../dist/src/capture-pages.js';
import { ApplicationState } from '../dist/src/application-state.js';
import { DEVELOPMENT_USER_ID } from '../dist/src/database-config.js';

// Replacing the new route by the old list (or bounding the old default) breaks this test.
test('capture pages preserve old all-results semantics, latest matching, ties and signed scope', async t => {
  const key = 'ab'.repeat(32);
  const app = await createApp({ ...await loadConfig(), cursorKey: key }); const db = app.get(DatabaseService).client;
  const fetch = await sessionFetch(t, app);
  const ids = [], foreign = randomUUID(), marker = 'page34 ' + randomUUID();
  t.after(async () => { try {
    await db.captureRevision.deleteMany({ where: { captureId: { in: ids } } });
    await db.capture.deleteMany({ where: { id: { in: ids } } });
    await db.session.deleteMany({ where: { userId: foreign } });
    await db.user.deleteMany({ where: { id: foreign } });
  } finally { await app.close(); } });
  await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
  const req = async (path, method = 'GET') => {
    const r = await fetch(base + path, { method });
    return { status: r.status, allow: r.headers.get('allow'), body: await r.json() };
  };
  assert.equal((await req('/captures/page')).status, 200);
  await db.user.create({ data: { id: foreign, webEnabled: true } });
  async function seed(text, userId = DEVELOPMENT_USER_ID) {
    const id = randomUUID(); ids.push(id);
    await db.capture.create({ data: { id, userId, originalText: 'initial preserved', createdAt: new Date('2026-01-01T00:00:00.000Z'),
      revisions: { create: [{ id: randomUUID(), revisionNo: 1, originalText: 'initial preserved', inputSource: 'manual' },
        { id: randomUUID(), revisionNo: 2, originalText: text, inputSource: 'manual' }] } } }); return id;
  }
  const expected = [];
  for (let i = 0; i < 101; i++) expected.push(await seed(marker + ' ' + i));
  expected.sort(); await seed(marker, foreign); const excluded = await seed('no longer matches');
  await db.captureRevision.updateMany({ where: { captureId: excluded, revisionNo: 1 }, data: { originalText: marker } });
  const root = '/captures/page?' + new URLSearchParams({ q: marker, limit: '20' });
  const legacy = (await req('/captures?' + new URLSearchParams({ q: marker, unknown: 'ignored' }))).body;
  assert.deepEqual(legacy.items.map(x => x.id), expected);
  assert.equal((await req('/captures?' + new URLSearchParams({ q: marker, limit: '100' }))).body.items.length, 100);
  let cursor, first, seen = [], expires;
  do {
    const r = await req(root + (cursor ? '&cursor=' + cursor : '')); assert.equal(r.status, 200);
    if (!first) first = r.body;
    seen.push(...r.body.items.map(x => x.id));
    assert.equal(r.body.hasMore, r.body.nextCursor !== null);
    cursor = r.body.nextCursor;
    if (cursor) { const payload = JSON.parse(Buffer.from(cursor.split('.')[0], 'base64url'));
      expires ??= payload.expires; assert.equal(payload.expires, expires); }
  } while (cursor);
  assert.deepEqual(seen, expected); assert.equal(seen.length, 101);
  assert.deepEqual((await req('/captures/page?q=absent-' + marker)).body, { items: [], limit: 20, hasMore: false, nextCursor: null });
  assert.equal((await req('/captures/page?' + new URLSearchParams({ q: marker + ' 100', limit: '1' }))).body.nextCursor, null);
  for (const suffix of ['limit=0', 'limit=01', 'limit=101', 'unknown=x', 'q=a&q=b', 'limit=1&limit=1', 'cursor=', 'cursor=' + 'x'.repeat(2049)])
    assert.equal((await req('/captures/page?' + suffix)).status, 400, suffix);
  for (const suffix of ['&q=changed', '&limit=1']) {
    const q = new URLSearchParams({ q: marker, limit: '20', cursor: first.nextCursor });
    const [k,v] = suffix.slice(1).split('='); q.set(k,v);
    assert.equal((await req('/captures/page?' + q)).body.code, 'INVALID_CURSOR');
  }
  assert.equal((await req(root + '&cursor=' + first.nextCursor.slice(0,-3) + 'xxx')).body.code, 'INVALID_CURSOR');
  const payload = JSON.parse(Buffer.from(first.nextCursor.split('.')[0], 'base64url'));
  function signed(value) { const b = Buffer.from(JSON.stringify(value)).toString('base64url'); return b + '.' + createHmac('sha256', Buffer.from(key,'hex')).update(b).digest('base64url'); }
  for (const value of [{ ...payload, expires: 1 }, { ...payload, scope: payload.scope.replace(DEVELOPMENT_USER_ID, foreign) },
    { ...payload, scope: payload.scope.replace('capture-list/v1', 'learning-records') }, { ...payload, at: '0000-01-01T00:00:00.000Z' }])
    assert.equal((await req(root + '&cursor=' + signed(value))).body.code, 'INVALID_CURSOR');
  assert.equal((await req('/learning-records?mode=cursor&cursor=' + first.nextCursor)).body.code, 'INVALID_CURSOR');
  const foreignPages = new CapturePages(app.get(DatabaseService), app.get(ApplicationState), key, foreign);
  assert.equal((await foreignPages.list({ q: marker })).items.length, 1);
  assert.throws(() => foreignPages.list({ q: marker, limit: '20', cursor: first.nextCursor }), e => e.code === 'INVALID_CURSOR');
  assert.equal((await req('/captures/page?' + new URLSearchParams({ q: marker.toUpperCase() }))).body.items.length, 0);
  assert.equal((await req('/captures/page?' + new URLSearchParams({ q: ' ' + marker }))).body.items.length, 0);
  assert.deepEqual(Object.keys(first.items[0]).sort(), ['chineseIntent', 'createdAt', 'id', 'originalText']);
  assert.equal((await req('/captures/page?limit=100')).body.limit, 100);
  // Live membership changes cannot turn a saved cursor into an export snapshot.
  const before = await seed('not matching before'), after = await seed('not matching after');
  await db.capture.update({ where: { id: before }, data: { createdAt: new Date('2025-01-01T00:00:00.000Z') } });
  await db.capture.update({ where: { id: after }, data: { createdAt: new Date('2027-01-01T00:00:00.000Z') } });
  const liveFirst = (await req(root)).body;
  for (const id of [before, after]) await db.captureRevision.create({ data: { id: randomUUID(), captureId: id,
    revisionNo: 3, originalText: marker + ' now matches', inputSource: 'manual' } });
  let liveCursor = liveFirst.nextCursor, liveSeen = liveFirst.items.map(x => x.id);
  while (liveCursor) {
    const page = (await req(root + '&cursor=' + liveCursor)).body;
    liveSeen.push(...page.items.map(x => x.id)); liveCursor = page.nextCursor;
  }
  assert.equal(liveSeen.includes(before), false); assert.equal(liveSeen.includes(after), true);
  assert.equal((await req('/captures?' + new URLSearchParams({ q: marker }))).body.items.length, 103);

  const foreignFetch = await sessionFetch({ after() {} }, app, foreign);
  const foreignPage = await foreignFetch(base + root); assert.equal(foreignPage.status, 200);
  assert.equal((await foreignPage.json()).items.length, 1);
  const foreignReplay = await foreignFetch(base + root + '&cursor=' + first.nextCursor);
  assert.equal(foreignReplay.status, 400); assert.equal((await foreignReplay.json()).code, 'INVALID_CURSOR');
  assert.equal((await globalThis.fetch(base + '/captures/page')).status, 401);
  await db.user.update({ where: { id: foreign }, data: { webEnabled: false } });
  assert.equal((await foreignFetch(base + '/captures/page')).status, 403);
  assert.equal((await req('/captures/page', 'POST')).status, 405);
  assert.equal((await req('/captures/page', 'PATCH')).allow, 'GET');
  assert.equal((await req('/captures/%70age')).status, 404);
  assert.equal((await req('/captures/page/extra')).status, 404);
});
