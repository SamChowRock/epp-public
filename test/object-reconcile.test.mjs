import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  scanObjects, observeHead, observerConfig, compare, html, writePrivate,
} from '../database/chapter-61-reconcile/lib.mjs';
import { scanDatabase, databaseConfig } from '../database/chapter-61-reconcile/db.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const key = `avatars/${id}.webp`;
const source = { endpoint: 'http://127.0.0.1:18633', bucket: 'avatars', prefix: 'avatars/' };
const object = { key, size: 1, lastModified: null, etag: '"x"' };
const clock = '2026-11-17T00:00:00.000Z';
const page = (count, marker, value) => ({
  number: 1, startedAt: clock, endedAt: clock, count, [marker]: value,
});

function db() {
  return {
    format: 'epp-avatar-db/v1',
    source: { host: 'localhost', port: 5432, database: 'verify', role: 'observer' },
    startedAt: clock, endedAt: clock, databaseClock: clock, complete: true, error: null,
    terminal: { users: true, attempts: true },
    pages: { users: [page(1, 'terminal', true)], attempts: [page(0, 'terminal', true)] },
    users: [{ id, avatar_id: id }], attempts: [],
  };
}

function objects() {
  return {
    format: 'epp-avatar-objects/v1', source, startedAt: clock, endedAt: clock,
    complete: true, error: null, terminal: true,
    pages: [page(1, 'truncated', false)], objects: [{ ...object }],
  };
}

const scan = (send, maxPages = 10) => scanObjects({ send }, source, 1, maxPages);
const attempt = () => ({ id, user_id: id, state: 'writing', created_at: clock, check_after: clock });

function trackedDb() {
  const manifest = db();
  manifest.users = [];
  manifest.attempts = [attempt()];
  manifest.pages.users[0].count = 0;
  manifest.pages.attempts[0].count = 1;
  return manifest;
}

function fakeDatabase(query) {
  return {
    connect: async () => {}, end: async () => {},
    query: async (sql, args) => {
      if (sql.includes('SELECT current_database')) {
        return { rows: [{ database: 'verify', role: 'auditor', host: '127.0.0.1', port: 5432, clock }] };
      }
      return query(sql, args);
    },
  };
}

test('two pages retain exact keys and terminal marker', async () => {
  let calls = 0;
  const manifest = await scan(async command => {
    assert.equal(command.input.Prefix, 'avatars/');
    if (++calls === 1) {
      return { Contents: [{ Key: key, Size: 1 }], IsTruncated: true, NextContinuationToken: 'opaque+/=' };
    }
    assert.equal(command.input.ContinuationToken, 'opaque+/=');
    return { Contents: [{ Key: 'avatars/other', Size: 2 }], IsTruncated: false };
  });
  assert.equal(manifest.complete, true);
  assert.equal(manifest.terminal, true);
  assert.equal(manifest.pages.length, 2);
  assert.deepEqual(manifest.objects.map(row => row.key), [key, 'avatars/other']);
});

test('empty final page is a complete scan', async () => {
  const manifest = await scan(async () => ({ IsTruncated: false }));
  assert.equal(manifest.complete, true);
  assert.equal(manifest.objects.length, 0);
  assert.equal(compare(db(), manifest).rows[0].classification, 'current-not-listed');
});

for (const [name, send, max] of [
  ['missing token', async () => ({ IsTruncated: true }), 10],
  ['cycle', async () => ({ IsTruncated: true, NextContinuationToken: 'same' }), 10],
  ['limit', async () => ({ IsTruncated: true, NextContinuationToken: 'next' }), 1],
  ['failure', async () => { throw Object.assign(new Error('SECRET'), { name: 'AccessDenied' }); }, 10],
]) {
  test(name + ' remains incomplete without exposing errors', async () => {
    const manifest = await scan(send, max);
    assert.equal(manifest.complete, false);
    assert.equal(manifest.terminal, false);
    assert.ok(manifest.error);
    assert.ok(!JSON.stringify(manifest).includes('SECRET'));
    assert.equal(compare(db(), manifest).rows[0].classification, 'current-unverified');
  });
}

for (const [code, status, ok] of [[404, 'missing', true], [403, 'unverified', false], [undefined, 'unverified', false]]) {
  test('HEAD ' + code, async () => {
    const client = { send: async () => { throw { $metadata: { httpStatusCode: code }, message: 'SECRET' }; } };
    const result = await observeHead(client, source, id);
    assert.equal(result.status, status);
    assert.equal(result.ok, ok);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
  });
}

test('HEAD present', async () => {
  assert.equal((await observeHead({ send: async () => ({}) }, source, id)).status, 'present');
});

test('target mismatch rejected before making calls', () => {
  assert.throws(() => observerConfig('https://other', 'avatars', {
    RECONCILE_S3_ENDPOINT: source.endpoint, RECONCILE_S3_BUCKET: 'avatars',
    RECONCILE_S3_ACCESS_KEY: 'x', RECONCILE_S3_SECRET_KEY: 'y',
  }));
});

test('comparison distinguishes incomplete sides and exact noncanonical keys', () => {
  let d = db();
  let o = objects();
  o.complete = false;
  o.error = 'HTTP_503';
  o.terminal = false;
  o.pages = [];
  o.objects = [];
  assert.equal(compare(d, o).rows[0].classification, 'current-unverified');

  o = objects();
  o.objects.push({ ...object, key: 'avatars/UPPER.webp' });
  o.pages[0].count = 2;
  d.complete = false;
  d.error = 'PAGE_LIMIT';
  d.terminal.attempts = false;
  d.pages.attempts = [];
  assert.equal(compare(d, o).rows.find(row => row.key === 'avatars/UPPER.webp').classification, 'object-db-unverified');
  d = db();
  assert.equal(compare(d, o).rows.find(row => row.key === 'avatars/UPPER.webp').classification, 'object-untracked-at-db-sample');
  o.objects = [];
  o.pages[0].count = 0;
  assert.equal(compare(d, o).rows[0].classification, 'current-not-listed');
});

test('tracked states kept and new object does not imply deletion', () => {
  const result = compare(trackedDb(), objects());
  assert.equal(result.rows[0].classification, 'tracked-noncurrent-writing');
  assert.ok(!JSON.stringify(result).includes('safe-to-delete'));
});

test('malformed manifests and wrong scope rejected', () => {
  for (const mutate of [d => d.format = 'x', d => d.users[0].id = 'bad', d => d.complete = 'yes']) {
    const d = db();
    mutate(d);
    assert.throws(() => compare(d, objects()));
  }
  const o = objects();
  o.source = { ...source, prefix: 'other/' };
  assert.throws(() => compare(db(), o));
  o.source = source;
  o.objects[0].key = 'other/key';
  assert.throws(() => compare(db(), o));
});

test('HTML escapes private object key and uses readable columns', () => {
  const o = objects();
  o.objects.push({ ...object, key: 'avatars/<img onerror="x">' });
  o.pages[0].count = 2;
  const result = html(compare(db(), o));
  assert.ok(result.includes('&lt;img'));
  assert.ok(!result.includes('<img'));
  assert.ok(!result.includes('<script'));
  assert.ok(!result.includes('<pre>'));
  assert.ok(result.includes('<th>尝试状态 / check_after</th>'));
  assert.ok(result.includes('<th>字节数</th>'));
});

test('private output never clobbers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'epp61-'));
  try {
    const file = join(dir, 'out.json');
    await writePrivate(file, 'original');
    await assert.rejects(writePrivate(file, 'replacement'));
    assert.equal(await readFile(file, 'utf8'), 'original');
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('DB target mismatch rejected before connecting', () => {
  assert.throws(() => databaseConfig('verify', 'postgresql://u:secret@localhost/production'));
});

test('DB uses one read-only repeatable snapshot and terminal pages for both tables', async () => {
  const calls = [];
  let usersPages = 0;
  let attemptPages = 0;
  const client = fakeDatabase(async sql => {
    calls.push(sql);
    if (sql.includes('FROM public.users')) return { rows: ++usersPages === 1 ? [{ id, avatar_id: id }] : [] };
    if (sql.includes('FROM public.avatar_writes')) {
      return { rows: ++attemptPages === 1 ? [{ ...attempt(), state: 'live', check_after: null }] : [] };
    }
    return { rows: [] };
  });
  const manifest = await scanDatabase(client, 'verify', 1);
  assert.equal(manifest.complete, true);
  assert.equal(manifest.pages.users.length, 2);
  assert.equal(manifest.pages.attempts.length, 2);
  assert.equal(calls[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(calls.at(-1), 'COMMIT');
  assert.equal(compare(manifest, objects()).rows[0].classification, 'current-listed');
});

test('DB failure retains prior rows but never claims complete', async () => {
  const client = fakeDatabase(async sql => {
    if (sql.includes('FROM public.users')) return { rows: [{ id, avatar_id: id }] };
    if (sql.includes('FROM public.avatar_writes')) throw new Error('SECRET');
    return { rows: [] };
  });
  const manifest = await scanDatabase(client, 'verify', 100);
  assert.equal(manifest.complete, false);
  assert.equal(manifest.users.length, 1);
  assert.equal(manifest.terminal.users, true);
  assert.equal(manifest.terminal.attempts, false);
  assert.ok(!JSON.stringify(manifest).includes('SECRET'));
  assert.equal(compare(manifest, objects()).rows[0].classification, 'current-listed');
});

test('DB page limit keeps partial inventory', async () => {
  const client = fakeDatabase(async sql => ({ rows: sql.includes('FROM public.users') ? [{ id, avatar_id: id }] : [] }));
  const manifest = await scanDatabase(client, 'verify', 1, 1);
  assert.equal(manifest.complete, false);
  assert.equal(manifest.error, 'PAGE_LIMIT');
  assert.equal(manifest.users.length, 1);
  assert.equal(compare(manifest, objects()).rows[0].classification, 'current-listed');
});

test('incomplete users do not establish tracked attempt as noncurrent', () => {
  const d = trackedDb();
  d.complete = false;
  d.error = 'PAGE_LIMIT';
  d.terminal.users = false;
  d.pages.users = [];
  assert.equal(compare(d, objects()).rows[0].classification, 'tracked-current-unverified-writing');
});

test('protocol failure on later page retains earlier exact keys and hides opaque token', async () => {
  let calls = 0;
  const token = 'PRIVATE_TOKEN';
  const manifest = await scan(async command => {
    if (++calls === 1) return { Contents: [{ Key: key, Size: 1 }], IsTruncated: true, NextContinuationToken: token };
    assert.equal(command.input.ContinuationToken, token);
    throw new Error('secret');
  });
  assert.equal(manifest.objects.length, 1);
  assert.equal(manifest.pages.length, 1);
  assert.equal(manifest.complete, false);
  assert.ok(!JSON.stringify(manifest).includes(token));
  assert.equal(compare(db(), manifest).rows[0].classification, 'current-listed');
});

test('duplicate exact keys collapse while distinct case survives', async () => {
  let calls = 0;
  const manifest = await scan(async () => {
    calls++;
    if (calls < 3) return {
      Contents: [{ Key: key, Size: calls }], IsTruncated: true,
      NextContinuationToken: calls === 1 ? 'a' : 'b',
    };
    return { Contents: [{ Key: 'avatars/UPPER.webp', Size: 3 }], IsTruncated: false };
  });
  assert.equal(manifest.objects.length, 2);
  assert.equal(manifest.objects.find(row => row.key === key).size, 2);
  assert.equal(compare(db(), manifest).counts.objects, 2);
});

test('manifests reject credential or unknown source properties', () => {
  const d = db();
  d.source.password = 'secret';
  assert.throws(() => compare(d, objects()));
});

for (const [name, mutate] of [
  ['object final page still truncated', (d, o) => {
    o.objects = [];
    o.pages = [page(0, 'truncated', true)];
  }],
  ['empty complete object pages', (d, o) => { o.pages = []; }],
  ['complete with error', (d, o) => { o.error = 'HTTP_503'; }],
  ['incomplete without error', (d, o) => { o.complete = false; }],
  ['object page sequence gap', (d, o) => { o.pages[0].number = 2; }],
  ['wrong object marker shape', (d, o) => { delete o.pages[0].truncated; o.pages[0].terminal = true; }],
  ['object keys exceed observed count', (d, o) => { o.pages[0].count = 0; }],
  ['DB rows disagree with pages', d => { d.pages.users[0].count = 0; }],
  ['DB terminal disagrees with pages', d => { d.pages.users[0].terminal = false; }],
  ['wrong DB marker shape', d => { delete d.pages.users[0].terminal; d.pages.users[0].truncated = false; }],
  ['empty complete DB pages', d => { d.pages.users = []; }],
  ['page after object final marker', (d, o) => { o.pages.push({ ...o.pages[0], number: 2 }); }],
  ['page times reversed', (d, o) => { o.pages[0].endedAt = '2026-11-16T00:00:00.000Z'; }],
  ['page outside observation interval', (d, o) => { o.pages[0].endedAt = '2026-11-18T00:00:00.000Z'; }],
]) {
  test('rejects contradictory evidence: ' + name, () => {
    const d = db();
    const o = objects();
    mutate(d, o);
    assert.throws(() => compare(d, o));
  });
}

test('DB row limit preserves an observed final marker but remains incomplete', async () => {
  const client = fakeDatabase(async sql => {
    if (sql.includes('FROM public.users')) return { rows: [{ id, avatar_id: id }] };
    return { rows: [] };
  });
  const manifest = await scanDatabase(client, 'verify', 100, 10, 0);
  assert.equal(manifest.complete, false);
  assert.equal(manifest.error, 'ROW_LIMIT');
  assert.equal(manifest.terminal.users, true);
  assert.equal(compare(manifest, objects()).rows[0].classification, 'current-listed');
});

test('a malformed later page never adds rows without page evidence', async () => {
  let calls = 0;
  const manifest = await scan(async () => {
    if (++calls === 1) return {
      Contents: [{ Key: key, Size: 1 }], IsTruncated: true, NextContinuationToken: 'next',
    };
    return { Contents: [{ Key: 'avatars/other', Size: -1 }], IsTruncated: false };
  });
  assert.equal(manifest.complete, false);
  assert.equal(manifest.pages.length, 1);
  assert.deepEqual(manifest.objects.map(row => row.key), [key]);
  assert.equal(compare(db(), manifest).rows[0].classification, 'current-listed');
});
