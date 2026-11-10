import './database-env.mjs';
import test from 'node:test';
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { AvatarObjects } from '../dist/src/avatar-objects.js';
import { AvatarPublication } from '../dist/src/avatar-publication.js';
import { cleanAvatarBatch } from '../dist/src/avatar-cleanup.js';
import { sessionFetch } from './session-fixture.mjs';

const png = await readFile(new URL('../examples/avatar-preview/harbor.png', import.meta.url));

async function fixture(t) {
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const { client: db, pool } = app.get(DatabaseService);
  const objects = app.get(AvatarObjects);
  const bytes = new Map();
  // Run the database/HTTP regression without a separate S3 service.
  objects.ready = () => {};
  objects.put = async (id, value) => bytes.set(id, value);
  objects.url = async id => 'https://avatar.example.test/' + id;
  objects.remove = async id => bytes.delete(id);
  const owner = randomUUID(), viewer = randomUUID();
  await db.user.createMany({ data: [owner, viewer].map(id => ({ id, webEnabled: true })) });
  const asOwner = await sessionFetch(t, app, owner);
  const asViewer = await sessionFetch(t, app, viewer);
  t.after(async () => {
    try {
      await db.user.update({ where: { id: owner }, data: { avatarId: null } });
      await db.avatarWrite.deleteMany({ where: { userId: owner } });
      await db.user.deleteMany({ where: { id: { in: [owner, viewer] } } });
    } finally { await app.close(); }
  });
  const url = await app.getUrl();
  const endpoint = url + '/profile/avatar';
  const publish = () => asOwner(endpoint, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
  return { app, db, pool, objects, bytes, owner, viewer, asOwner, asViewer, url, endpoint, publish };
}

test('publishing preserves private defaults, checks both principals, and separates preview from publication', async t => {
  const { db, owner, viewer, asOwner, asViewer, url, endpoint, publish, bytes } = await fixture(t);
  const projection = url + '/profiles/' + owner + '/avatar';
  assert.deepEqual(await (await asOwner(endpoint + '/visibility')).json(), { visible: false });
  assert.equal((await asOwner(endpoint)).status, 404);
  assert.equal((await fetch(endpoint)).status, 401);
  assert.equal((await asOwner(endpoint + '/preview', {
    method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png,
  })).status, 200);
  assert.equal(await db.avatarWrite.count({ where: { userId: owner } }), 0);
  const result = await publish();
  assert.equal(result.status, 200);
  const { avatarId } = await result.json();
  assert.ok(bytes.has(avatarId));
  assert.equal((await (await asOwner(endpoint)).json()).avatarId, avatarId);
  assert.equal((await asViewer(projection)).status, 404);
  const patch = visible => asOwner(endpoint + '/visibility', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible }),
  });
  assert.equal((await patch(true)).status, 200);
  assert.deepEqual(await (await asOwner(endpoint + '/visibility')).json(), { visible: true });
  assert.equal((await (await asViewer(projection)).json()).avatarId, avatarId);
  await db.user.update({ where: { id: owner }, data: { webEnabled: false } });
  assert.equal((await asViewer(projection)).status, 404);
  await db.user.update({ where: { id: owner }, data: { webEnabled: true } });
  await db.user.update({ where: { id: viewer }, data: { webEnabled: false } });
  assert.equal((await asViewer(projection)).status, 403);
  assert.equal((await patch(false)).status, 200);
});

test('a late completion cannot replace a winner and a tombstone removes a late object on a later pass', async t => {
  const { app, db, owner, pool, objects, bytes, publish } = await fixture(t);
  const service = app.get(AvatarPublication);
  const identity = { userId: owner, sessionId: (await db.session.findFirstOrThrow({ where: { userId: owner } })).id };
  const slow = await service.reserve(identity);
  const winner = (await (await publish()).json()).avatarId;
  const connection = await pool.connect();
  try {
    assert.deepEqual(await cleanAvatarBatch(connection, objects, slow), { deleted: 1, failed: 0 });
    assert.equal(bytes.has(slow), false);
    await assert.rejects(service.publish(identity, slow, png), error => error.code === 'AVATAR_SUPERSEDED');
    assert.ok(bytes.has(slow));
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).avatarId, winner);
    await db.avatarWrite.update({ where: { id: slow }, data: { checkAfter: new Date(0) } });
    assert.deepEqual(await cleanAvatarBatch(connection, objects, slow), { deleted: 1, failed: 0 });
    assert.equal(bytes.has(slow), false);
    assert.ok(bytes.has(winner));
    assert.equal((await db.avatarWrite.findUniqueOrThrow({ where: { id: slow } })).state, 'retired');
  } finally { connection.release(); }
});

test('revoking a session after PUT leaves the existing reference and its object intact', async t => {
  const { app, db, objects, owner, bytes, publish } = await fixture(t);
  const previous = (await (await publish()).json()).avatarId;
  const service = app.get(AvatarPublication);
  const session = await db.session.findFirstOrThrow({ where: { userId: owner } });
  const identity = { userId: owner, sessionId: session.id };
  const reserved = await service.reserve(identity);
  const put = objects.put;
  objects.put = async (id, value) => {
    await put(id, value);
    await db.session.delete({ where: { id: session.id } });
  };
  await assert.rejects(service.publish(identity, reserved, png), error => error.code === 'AUTH_REQUIRED');
  assert.ok(bytes.has(reserved));
  assert.ok(bytes.has(previous));
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).avatarId, previous);
  assert.equal((await db.avatarWrite.findUniqueOrThrow({ where: { id: reserved } })).state, 'writing');
});

test('exact cleanup commits an expired reservation before DELETE and retries only that key', async t => {
  const { app, db, owner, objects, bytes, publish } = await fixture(t);
  const current = (await (await publish()).json()).avatarId;
  const service = app.get(AvatarPublication);
  const { id: sessionId } = await db.session.findFirstOrThrow({ where: { userId: owner } });
  const identity = { userId: owner, sessionId };
  const sibling = await service.reserve(identity);
  const target = await service.reserve(identity);
  bytes.set(sibling, png);
  bytes.set(target, png);
  const read = id => db.avatarWrite.findUniqueOrThrow({ where: { id } });
  const before = await read(sibling);
  assert.equal(before.state, 'retired');
  assert.equal((await read(target)).state, 'writing');

  // The API pool is an independent observer of this dedicated autocommit connection.
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  const clean = id => cleanAvatarBatch(client, objects, id);
  const due = () => db.avatarWrite.update({ where: { id: target }, data: { checkAfter: new Date(0) } });
  const observed = [];
  objects.remove = async id => {
    const row = await read(id);
    observed.push({ id, state: row.state });
    if (observed.length === 1) throw Error('Injected storage outage');
    bytes.delete(id);
  };
  try {
    for (const id of [current, target, randomUUID()]) {
      assert.deepEqual(await clean(id), { deleted: 0, failed: 0 });
    }
    await due();
    assert.deepEqual(await clean(target), { deleted: 0, failed: 1 });
    assert.deepEqual(observed, [{ id: target, state: 'retired' }]);
    assert.equal((await read(target)).state, 'retired');
    assert.ok(bytes.has(target));
    assert.deepEqual(await clean(target), { deleted: 0, failed: 0 });
    await due();
    assert.deepEqual(await clean(target), { deleted: 1, failed: 0 });
    assert.deepEqual(observed, Array(2).fill({ id: target, state: 'retired' }));
    assert.equal(bytes.has(target), false);
    assert.ok(bytes.has(current) && bytes.has(sibling));
    assert.deepEqual(await read(sibling), before);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).avatarId, current);
  } finally { await client.end(); }
});
