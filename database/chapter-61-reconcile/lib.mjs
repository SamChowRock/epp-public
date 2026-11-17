import { open, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

export const now = () => new Date().toISOString();
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function demand(condition) {
  if (!condition) throw new Error('INVALID_INPUT');
}

export function integer(value, fallback, max) {
  const n = value === undefined ? fallback : Number(value);
  demand(Number.isInteger(n) && n >= 1 && n <= max);
  return n;
}

export function endpoint(value) {
  const u = URL.parse(value ?? '');
  const localHttp = u?.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  demand(u && value === u.origin && (u.protocol === 'https:' || localHttp));
  return value;
}

export function observerConfig(expectedEndpoint, expectedBucket, env = process.env) {
  const target = {
    endpoint: endpoint(env.RECONCILE_S3_ENDPOINT),
    bucket: env.RECONCILE_S3_BUCKET,
    prefix: 'avatars/',
  };
  demand(target.endpoint === expectedEndpoint && target.bucket === expectedBucket);
  demand(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(target.bucket));
  demand(env.RECONCILE_S3_ACCESS_KEY && env.RECONCILE_S3_SECRET_KEY);
  return {
    ...target,
    credentials: {
      accessKeyId: env.RECONCILE_S3_ACCESS_KEY,
      secretAccessKey: env.RECONCILE_S3_SECRET_KEY,
    },
  };
}

// Only allowlisted codes escape the process; server messages may contain secrets.
export function safeError(e) {
  const status = e?.$metadata?.httpStatusCode;
  if (Number.isInteger(status) && status >= 100 && status <= 599) return 'HTTP_' + status;
  const name = e?.code ?? e?.name;
  const allowed = [
    'AccessDenied', 'NoSuchBucket', 'NoSuchKey', 'NotFound', 'AbortError', 'TimeoutError',
    'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EEXIST', 'INVALID_INPUT', 'PAGE_LIMIT',
    'ROW_LIMIT', 'INVALID_PAGE', 'TOKEN_CYCLE', 'QUERY_FAILED', 'TARGET_MISMATCH',
  ];
  return allowed.includes(name) ? name : 'OBSERVATION_FAILED';
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

export async function writePrivate(file, content) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const handle = await open(file, 'wx', 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function scanObjects(client, source, pageSize = 100, maxPages = 10000) {
  const manifest = {
    format: 'epp-avatar-objects/v1', source, startedAt: now(), endedAt: null,
    complete: false, terminal: false, pages: [], objects: [], error: null,
  };
  const seenTokens = new Set();
  const objects = new Map();
  let token;
  try {
    for (let i = 0; i < maxPages; i++) {
      const startedAt = now();
      const response = await client.send(new ListObjectsV2Command({
        Bucket: source.bucket, Prefix: 'avatars/', MaxKeys: pageSize,
        ...(token ? { ContinuationToken: token } : {}),
      }), { abortSignal: AbortSignal.timeout(15000) });
      demand(Array.isArray(response.Contents ?? []) && typeof response.IsTruncated === 'boolean');
      const contents = response.Contents ?? [];
      if (contents.length > pageSize) fail('INVALID_PAGE');
      // Accept a page only after validating every item; malformed pages cannot
      // leave rows without corresponding page evidence in a partial manifest.
      const pageRows = contents.map(object => {
        if (typeof object.Key !== 'string' || !object.Key.startsWith('avatars/') ||
            !Number.isSafeInteger(object.Size) || object.Size < 0) fail('INVALID_PAGE');
        const row = {
          key: object.Key, size: object.Size,
          lastModified: object.LastModified ? new Date(object.LastModified).toISOString() : null,
          etag: object.ETag ?? null,
        };
        if (row.etag !== null && typeof row.etag !== 'string') fail('INVALID_PAGE');
        return row;
      });
      for (const row of pageRows) objects.set(row.key, row);
      manifest.pages.push({
        number: i + 1, startedAt, endedAt: now(), count: contents.length,
        truncated: response.IsTruncated,
      });
      manifest.terminal = !response.IsTruncated;
      if (objects.size > 1000000) fail('ROW_LIMIT');
      if (manifest.terminal) {
        manifest.complete = true;
        break;
      }
      if (typeof response.NextContinuationToken !== 'string' || !response.NextContinuationToken) {
        fail('INVALID_PAGE');
      }
      if (seenTokens.has(response.NextContinuationToken)) fail('TOKEN_CYCLE');
      seenTokens.add(response.NextContinuationToken);
      token = response.NextContinuationToken;
    }
    if (!manifest.complete) fail('PAGE_LIMIT');
  } catch (error) {
    manifest.error = safeError(error);
  }
  manifest.objects = [...objects.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  manifest.endedAt = now();
  return manifest;
}

export async function observeHead(client, source, id) {
  demand(uuid.test(id));
  try {
    await client.send(new HeadObjectCommand({
      Bucket: source.bucket, Key: `avatars/${id}.webp`,
    }), { abortSignal: AbortSignal.timeout(15000) });
    return { status: 'present', observedAt: now(), ok: true };
  } catch (error) {
    const missing = error?.$metadata?.httpStatusCode === 404;
    return {
      status: missing ? 'missing' : 'unverified', observedAt: now(),
      error: safeError(error), ok: missing,
    };
  }
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function only(value, names) {
  demand(record(value) && Object.keys(value).every(key => names.includes(key)));
}

function validateObservation(manifest, format) {
  demand(record(manifest) && manifest.format === format && record(manifest.source));
  demand(typeof manifest.complete === 'boolean');
  demand(timestamp(manifest.startedAt) && timestamp(manifest.endedAt));
  demand(Date.parse(manifest.startedAt) <= Date.parse(manifest.endedAt));
  const error = manifest.error;
  demand(error === null || (typeof error === 'string' &&
    (safeError({ code: error }) === error || /^HTTP_[1-5][0-9]{2}$/.test(error))));
  // A failure always has a safe error code. A completed scan cannot also fail.
  demand(manifest.complete ? error === null : error !== null);
}

// Page numbers and final markers belong to each source, not to a shared generic
// flag. Rows from failed later requests are absent, while earlier pages remain.
function validatePages(pages, marker, terminal, manifest) {
  demand(Array.isArray(pages) && typeof terminal === 'boolean');
  let previousEnd = Date.parse(manifest.startedAt);
  let count = 0;
  for (const [index, page] of pages.entries()) {
    only(page, ['number', 'startedAt', 'endedAt', 'count', marker]);
    demand(page.number === index + 1 && Number.isInteger(page.count));
    demand(page.count >= 0 && page.count <= 1000 && typeof page[marker] === 'boolean');
    demand(timestamp(page.startedAt) && timestamp(page.endedAt));
    const start = Date.parse(page.startedAt);
    const end = Date.parse(page.endedAt);
    demand(previousEnd <= start && start <= end && end <= Date.parse(manifest.endedAt));
    const final = marker === 'terminal' ? page.terminal : !page.truncated;
    // No observed page is allowed after a source has declared its final page.
    demand(!final || index === pages.length - 1);
    if (marker === 'terminal' && !final) demand(page.count > 0);
    previousEnd = end;
    count += page.count;
  }
  const last = pages.at(-1);
  const observedTerminal = last !== undefined &&
    (marker === 'terminal' ? last.terminal : !last.truncated);
  demand(terminal === observedTerminal);
  return count;
}

function validateDatabase(db) {
  validateObservation(db, 'epp-avatar-db/v1');
  only(db, ['format', 'source', 'startedAt', 'endedAt', 'databaseClock', 'complete',
    'terminal', 'pages', 'users', 'attempts', 'error']);
  only(db.source, ['host', 'port', 'database', 'role']);
  demand(typeof db.source.host === 'string' && db.source.host.length > 0);
  demand(Number.isInteger(db.source.port) && db.source.port > 0 && db.source.port <= 65535);
  demand(typeof db.source.database === 'string' && db.source.database.length > 0);
  demand(typeof db.source.role === 'string' && db.source.role.length > 0);
  demand(timestamp(db.databaseClock));
  only(db.terminal, ['users', 'attempts']);
  only(db.pages, ['users', 'attempts']);
  demand(Array.isArray(db.users) && Array.isArray(db.attempts));
  for (const kind of ['users', 'attempts']) {
    const count = validatePages(db.pages[kind], 'terminal', db.terminal[kind], db);
    demand(count === db[kind].length);
    // A successful keyset scan contains full pages followed by a shorter final
    // page; infer that page size from the first nonterminal page when present.
    const fullSize = db.pages[kind].find(page => !page.terminal)?.count;
    if (fullSize !== undefined) {
      demand(db.pages[kind].every(page => page.terminal ? page.count < fullSize : page.count === fullSize));
    }
  }
  demand(!db.complete || (db.terminal.users && db.terminal.attempts));
  // The scanner reads users before attempts inside one transaction.
  if (db.pages.users.length && db.pages.attempts.length) {
    demand(Date.parse(db.pages.users.at(-1).endedAt) <= Date.parse(db.pages.attempts[0].startedAt));
  }
  for (const [kind, fields] of [
    ['users', ['id', 'avatar_id']],
    ['attempts', ['id', 'user_id', 'state', 'created_at', 'check_after']],
  ]) {
    let previousId = null;
    for (const row of db[kind]) {
      only(row, fields);
      demand(uuid.test(row.id) && (previousId === null || previousId < row.id));
      previousId = row.id;
      if (kind === 'users') {
        demand(row.avatar_id === null || uuid.test(row.avatar_id));
      } else {
        demand(uuid.test(row.user_id) && ['writing', 'live', 'retired'].includes(row.state));
        demand(timestamp(row.created_at) && (row.check_after === null || timestamp(row.check_after)));
      }
    }
  }
}

function validateObjects(objects) {
  validateObservation(objects, 'epp-avatar-objects/v1');
  only(objects, ['format', 'source', 'startedAt', 'endedAt', 'complete', 'terminal', 'pages', 'objects', 'error']);
  only(objects.source, ['endpoint', 'bucket', 'prefix']);
  endpoint(objects.source.endpoint);
  demand(typeof objects.source.bucket === 'string' && objects.source.bucket.length > 0);
  demand(objects.source.prefix === 'avatars/' && Array.isArray(objects.objects));
  const count = validatePages(objects.pages, 'truncated', objects.terminal, objects);
  demand(!objects.complete || objects.terminal);
  // Exact-key deduplication may reduce the retained count. It cannot add keys,
  // or discard every observed object from a nonempty successfully read page.
  demand(objects.objects.length <= count && (count === 0) === (objects.objects.length === 0));
  let previousKey = null;
  for (const object of objects.objects) {
    only(object, ['key', 'size', 'lastModified', 'etag']);
    demand(typeof object.key === 'string' && object.key.startsWith('avatars/'));
    demand(previousKey === null || previousKey < object.key);
    previousKey = object.key;
    demand(Number.isSafeInteger(object.size) && object.size >= 0);
    demand(object.lastModified === null || timestamp(object.lastModified));
    demand(object.etag === null || typeof object.etag === 'string');
  }
}

export function compare(db, objects) {
  validateDatabase(db);
  validateObjects(objects);
  const byKey = new Map();
  const get = key => {
    if (!byKey.has(key)) byKey.set(key, { key, currentUsers: [], attempts: [], object: null });
    return byKey.get(key);
  };
  for (const user of db.users) {
    if (user.avatar_id) get(`avatars/${user.avatar_id}.webp`).currentUsers.push(user.id);
  }
  for (const attempt of db.attempts) get(`avatars/${attempt.id}.webp`).attempts.push(attempt);
  for (const object of objects.objects) get(object.key).object = object;
  for (const row of byKey.values()) {
    if (row.currentUsers.length) {
      row.classification = row.object ? 'current-listed' :
        objects.complete ? 'current-not-listed' : 'current-unverified';
    } else if (row.attempts.length) {
      const prefix = db.terminal.users ? 'tracked-noncurrent-' : 'tracked-current-unverified-';
      row.classification = prefix + row.attempts[0].state;
    } else {
      row.classification = db.complete ? 'object-untracked-at-db-sample' : 'object-db-unverified';
    }
    row.listObservation = row.object ? 'listed' : objects.complete ? 'not-listed' : 'unverified';
  }
  const rows = [...byKey.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  return {
    format: 'epp-avatar-comparison/v1', createdAt: now(), database: db, objectListing: objects,
    counts: { users: db.users.length, attempts: db.attempts.length, objects: objects.objects.length, rows: rows.length },
    rows,
    limitations: [
      '数据库仅在一个只读快照内一致；对象多页清点不是快照，也不与数据库构成共同快照。',
      '未列出不等于 HEAD 404；403、网络失败和不完整清点均不能证明不存在。',
      '未被数据库样本追踪的对象可能在样本之后发布；按同一用户与键重新观察。',
      'ETag 仅为服务端标识，不作为内容校验和。本报告不作删除授权。',
    ],
  };
}

export function html(report) {
  const escape = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const db = report.database;
  const objects = report.objectListing;
  const complete = manifest => manifest.complete ? '完整' : '不完整（' + escape(manifest.error) + '）';
  const sourceCard = (title, source, manifest, count) => `
    <section><h2>${title}</h2><p class="source">${escape(source)}</p>
    <p>${escape(manifest.startedAt)} → ${escape(manifest.endedAt)}</p>
    <p><strong>${complete(manifest)}</strong> · ${escape(count)}</p></section>`;
  const rows = report.rows.map(row => {
    const attempts = row.attempts.map(attempt =>
      escape(attempt.state) + ' / ' + escape(attempt.check_after ?? '—')).join('<br>') || '—';
    const cells = [
      escape(row.key), escape(row.classification),
      row.currentUsers.map(escape).join('<br>') || '—', attempts,
      escape(row.listObservation), row.object ? escape(row.object.size) : '—',
    ];
    return '<tr>' + cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
  }).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>头像只读对照</title><style>
body{font:15px/1.6 system-ui,sans-serif;margin:32px;color:#182431;background:#f5f7fa}
h1{margin-bottom:4px}h2{font-size:17px;margin-top:0}.summary{display:flex;gap:20px;flex-wrap:wrap}
section{background:white;border:1px solid #d8e0e8;border-radius:8px;padding:18px;flex:1;min-width:280px}
p{margin:6px 0}.source,td:first-child{font-family:ui-monospace,monospace}
.table-wrap{overflow-x:auto;margin-top:24px}table{border-collapse:collapse;width:100%;background:white}
th,td{border:1px solid #d8e0e8;padding:12px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{background:#eaf0f6}td:first-child{min-width:220px}td:nth-child(2){min-width:180px}
.notice{color:#70511b;background:#fff5dd;padding:12px;border-radius:6px;margin:16px 0}
ul{padding-left:22px}</style><h1>头像只读对照</h1>
<p>私有观察资料 · ${escape(report.createdAt)} · ${escape(report.counts.rows)} 个精确键</p>
<p class="notice">两侧观察时间不同。差异用于追查，不构成删除依据；完整清点中的未列出也不等于 HEAD 404。</p>
<div class="summary">
${sourceCard('数据库样本', `${db.source.host}:${db.source.port} / ${db.source.database} / ${db.source.role}`, db,
    `${report.counts.users} 个用户 · ${report.counts.attempts} 条尝试记录`)}
${sourceCard('对象清点', `${objects.source.endpoint} / ${objects.source.bucket} / ${objects.source.prefix}`, objects,
    `${report.counts.objects} 个对象 · ${objects.pages.length} 页`)}
</div><div class="table-wrap"><table><thead><tr>
<th>精确键</th><th>分类</th><th>当前用户</th><th>尝试状态 / check_after</th><th>列举观察</th><th>字节数</th>
</tr></thead><tbody>${rows}</tbody></table></div>
<ul>${report.limitations.map(text => '<li>' + escape(text) + '</li>').join('')}</ul>
<p>完整来源、页记录、时间戳、ETag 与尝试详情保留在同名 JSON 中。</p></html>`;
}
