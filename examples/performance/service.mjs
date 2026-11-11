import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { withVerifiedDatabase } from '../../scripts/verify-database.mjs';
import { createApp } from '../../dist/src/app.js';
import { DatabaseService } from '../../dist/src/database.service.js';
import { hashPassword } from '../../dist/src/password.js';

const [expected, ...extra] = process.argv.slice(2);
if (expected !== 'epp_ch55_lab' || extra.length ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(URL.parse(process.env.DATABASE_URL)?.hostname)) {
  throw Error('Use a dedicated local epp_ch55_lab database.');
}
Object.assign(process.env, { NODE_ENV: 'development', LOG_LEVEL: 'debug', DB_POOL_MAX: '2',
  DB_QUERY_DEBUG: 'false', APP_ORIGIN: 'http://127.0.0.1:3000', DOCS_ENABLED: 'false' });
await withVerifiedDatabase(expected, async observer => {
  const app = await createApp();
  const { client: db, pool } = app.get(DatabaseService);
  const userId = randomUUID(), password = 'Lab phrase ' + randomUUID();
  let saved = false;
  const counts = () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount });
  const report = (phase, fields) => console.log('LAB', JSON.stringify({ phase, ...fields }));
  async function until(read) {
    const deadline = performance.now() + 650;
    do { const fact = await read(); if (fact) return fact; await delay(8); } while (performance.now() < deadline);
    throw Error('Expected live wait not seen before release.');
  }
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    await db.user.create({ data: { id: userId, webEnabled: true,
      passwordCredential: { create: { passwordHash: await hashPassword(password) } } } });
    saved = true;
    const login = async phase => {
      const start = performance.now();
      const res = await fetch(url + '/auth/login', { method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-EPP-Request': '1' }, body: JSON.stringify({ userId, password }) });
      await res.arrayBuffer();
      report(phase, { status: res.status, ms: Math.round(performance.now()-start), requestId: res.headers.get('x-request-id') });
      assert.equal(res.status, 200);
      return res.headers.getSetCookie()[0].split(';')[0];
    };
    const cookie = await login('login');
    const get = async (path, phase) => {
      const t = performance.now(), res = await fetch(url + path, { headers: { cookie } });
      await res.arrayBuffer();
      assert.equal(res.status, 200);
      const ms = Math.round(performance.now()-t);
      if (phase) report(phase, { status: res.status, ms, requestId: res.headers.get('x-request-id') });
      return ms;
    };
    await get('/captures','capture-list');
    await get('/learning-records', 'learning-list');
    for (const concurrency of [1, 2, 4]) {
      const start = performance.now(), ms = [];
      await Promise.all(Array.from({ length: concurrency }, async () => {
        for (let i = 0; i < 12 / concurrency; i++) ms.push(await get('/learning-records'));
      }));
      ms.sort((a,b)=>a-b);
      report('read-batch', { concurrency, successes: ms.length, totalMs: Math.round(performance.now()-start),
        medianMs: (ms[5]+ms[6])/2, maxMs: ms.at(-1) });
    }
    const lockCount = async () => (await observer.query(`SELECT count(*)::int AS n
      FROM pg_stat_activity WHERE datname=current_database() AND application_name='epp-api'
      AND pg_backend_pid()=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'`)).rows[0].n;
    // PG cannot see clients which have not yet borrowed an application connection.
    const borrowed = [];
    let pending;
    try {
      for (let i=0;i<2;i++) borrowed.push(await pool.connect());
      pending = login('pool-login');
      pending.catch(()=>{}); // rethrow after resources have been released
      await until(() => pool.waitingCount > 0);
      report('before-pool-release', { ...counts(), blockedByObserver: await lockCount() });
      await delay(200);
    } finally {
      for (const client of borrowed) client.release();
      if (pending) await pending;
    }
    pending = undefined;
    await observer.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    try {
      await observer.query('SET LOCAL stats_fetch_consistency = none');
      await observer.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      pending = login('lock-login');
      pending.catch(()=>{});
      const n = await until(lockCount);
      report('before-lock-release', { ...counts(), blockedByObserver: n });
      await delay(200);
    } finally {
      await observer.query('ROLLBACK');
      if (pending) await pending;
    }
    const streams = [];
    try {
      for (let i=0;i<4;i++) {
        const abort = new AbortController();
        streams.push(abort);
        const res = await fetch(url+'/notifications/events',{ headers:{ cookie },signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)]) });
        assert.equal(res.status,200);
        const reader=res.body.getReader();
        let frame='';
        while (!frame.includes('\n\n')) { const {done,value}=await reader.read(); assert.equal(done,false); frame+=Buffer.from(value).toString(); }
        assert.match(frame,/event: inbox/);
      }
      const fifth=await fetch(url+'/notifications/events',{headers:{cookie},signal:AbortSignal.timeout(2000)});
      assert.equal(fifth.status,429); assert.equal((await fifth.json()).code,'STREAM_LIMIT');
      report('four-streams', {fifth:fifth.status,...counts()});
    } finally { for(const abort of streams) abort.abort(); }
    // Prove a slot can actually be borrowed again; a low heap reading would not prove this.
    await until(async ()=>{
      const ac = new AbortController();
      try {
        const res=await fetch(url+'/notifications/events',{headers:{cookie},signal:AbortSignal.any([ac.signal,AbortSignal.timeout(2000)])});
        if(res.status===429){await res.arrayBuffer();return false;}
        assert.equal(res.status,200); report('reopened-stream',{status:res.status});return true;
      } finally { ac.abort(); }
    });
  } finally {
    try { if (saved) await db.$transaction([
      db.session.deleteMany({where:{userId}}),db.passwordCredential.deleteMany({where:{userId}}),
      db.user.delete({where:{id:userId}}),
    ]); } finally { await app.close(); }
  }
});
