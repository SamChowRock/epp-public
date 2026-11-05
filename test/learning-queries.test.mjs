import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { DEVELOPMENT_USER_ID } from '../dist/src/database-config.js';

test('bounded reads preserve sources, exclude foreign relations and retain historical identities', async t => {
  const app = await createApp(), db = app.get(DatabaseService).client;
  const captures = [], expressions = new Set(), foreign = randomUUID();
  t.after(async () => {
    try {
      const candidates = await db.candidate.findMany({ where: { revision: { captureId: { in: captures } } } });
      const ids = candidates.map(x => x.id);
      await db.commandReceipt.deleteMany({ where: { candidateId: { in: ids } } });
      await db.learningRecord.deleteMany({ where: { candidateId: { in: ids } } });
      await db.expressionForm.deleteMany({ where: { expressionId: { in: [...expressions] } } });
      await db.expression.deleteMany({ where: { id: { in: [...expressions] } } });
      await db.candidate.deleteMany({ where: { id: { in: ids } } });
      await db.captureRevision.deleteMany({ where: { captureId: { in: captures } } });
      await db.capture.deleteMany({ where: { id: { in: captures } } });
      await db.user.deleteMany({ where: { id: foreign } });
    } finally { await app.close(); }
  });
  await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
  async function request(path, body) {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json(), headers: r.headers };
  }
  const text = 'Shared ' + randomUUID();
  const saved = [];
  let cap, revision;
  for (let i = 0; i < 23; i++) {
    if (i % 5 === 0) {
      cap = (await request('/captures', { originalText: 'Original source ' + i })).body; captures.push(cap.id);
      revision = (await request('/captures/' + cap.id + '/revisions')).body.items[0];
    }
    const candidate = (await request('/revisions/' + revision.id + '/candidates', {
      candidateNo: i % 5 + 1, englishText: i < 2 ? text : text + i, chineseMeaning: '查询样本',
    })).body;
    const accepted = await request('/candidates/' + candidate.id + '/accept', { operationId: randomUUID() });
    assert.equal(accepted.status, 201);saved.push(accepted.body);expressions.add(accepted.body.expression.id);
  }
  await request('/captures/' + captures[0] + '/revisions', { originalText: 'New source is not historical evidence.', chineseIntent: null });
  const list = await request('/learning-records');assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 20);assert.equal(list.body.limit, 20);assert.equal(list.body.hasMore, true);
  const id = saved[0].expression.id;
  const filtered = await request('/learning-records?expressionId=' + id + '&limit=1');
  assert.equal(filtered.body.items.length, 1);assert.equal(filtered.body.hasMore, true);
  assert.equal(filtered.body.items[0].expression.id, id);
  const detail = await request('/learning-records/' + saved[0].learningRecord.id);
  assert.equal(detail.body.source.originalText, 'Original source 0');assert.equal(detail.body.source.revisionNo, 1);
  assert.equal(detail.body.source.candidateId, saved[0].candidate.id);
  for (const key of ['userId','semanticKey','normalizedText','normalizedMeaning','response','operationId']) assert.equal(JSON.stringify(detail.body).includes('"'+key+'"'), false);
  const notModified = await new Promise((resolve,reject) => {
    http.get(base + '/learning-records/' + saved[0].learningRecord.id,
      { headers: { 'If-None-Match': detail.headers.get('etag') } }, r => { r.resume();r.on('end',()=>resolve(r.statusCode)); }).on('error',reject);
  });assert.equal(notModified,304);
  for (const q of ['limit=0','limit=101','limit=01','limit=1&limit=2','userId='+foreign,'offset=1','expressionId=no','expressionId='+id+'&expressionId='+id]) assert.equal((await request('/learning-records?'+q)).status,400,q);
  assert.equal((await request('/star-map?expressionId='+id)).status,400);
  assert.equal((await request('/learning-records/'+saved[0].learningRecord.id+'?limit=1')).status,400);
  for (const missing of ['bad',randomUUID(),'%31'+saved[0].learningRecord.id.slice(1)]) assert.equal((await request('/learning-records/'+missing)).status,404);
  assert.equal((await request('/star-map',{})).status,405);
  assert.deepEqual((await request('/learning-records?expressionId='+randomUUID())).body,{items:[],limit:20,hasMore:false});
  // The retained old identity is readable even without a future-reuse key.
  await db.expression.update({ where: { id }, data: { semanticKey: null } });
  const graph = await request('/star-map?limit=100');
  assert.equal(graph.body.nodes.find(x=>x.id===id).recordCount,2);
  assert.equal(graph.body.hasMore,false);
  // Same timestamps still have a defined tie order.
  await db.learningRecord.updateMany({ where: { id: { in: saved.map(x=>x.learningRecord.id) } }, data: { createdAt: new Date('2026-01-01T00:00:00Z') } });
  const ordered = (await request('/learning-records?expressionId='+id)).body.items.map(x=>x.id);
  assert.deepEqual(ordered,saved.slice(0,2).map(x=>x.learningRecord.id).sort().reverse());
  await db.user.create({data:{id:foreign}});
  // A cross-owner link must not turn an owned learning row into permission to read a foreign source.
  await db.capture.update({where:{id:captures[0]},data:{userId:foreign}});
  assert.equal((await request('/learning-records/'+saved[0].learningRecord.id)).status,404);
  assert.deepEqual((await request('/learning-records?expressionId='+id)).body.items,[]);
  assert.equal((await request('/star-map?limit=100')).body.nodes.some(x=>x.id===id),false);
  await db.capture.update({where:{id:captures[0]},data:{userId:DEVELOPMENT_USER_ID}});
  await db.expression.update({where:{id},data:{userId:foreign}});
  assert.equal((await request('/learning-records/'+saved[0].learningRecord.id)).status,404);
  await db.expression.update({where:{id},data:{userId:DEVELOPMENT_USER_ID}});
  await db.learningRecord.update({where:{id:saved[0].learningRecord.id},data:{userId:foreign}});
  assert.equal((await request('/learning-records/'+saved[0].learningRecord.id)).status,404);
  assert.equal((await request('/star-map?limit=100')).body.nodes.find(x=>x.id===id).recordCount,1);
});
