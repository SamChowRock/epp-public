import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { removeTestCaptures } from './cleanup.mjs';

test('live pagination handles ties, head inserts, deleted anchors, filters and half-open time', async t => {
  const app=await createApp(), db=app.get(DatabaseService).client;
  const preserved=new Set((await db.expression.findMany({select:{id:true}})).map(x=>x.id)), captures=[];
  t.after(async()=>{try{await removeTestCaptures(db,captures,preserved);}finally{await app.close();}});
  await app.listen(0,'127.0.0.1'); const base=await app.getUrl();
  async function req(path,body) { const r=await fetch(base+path,body ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,body:await r.json()}; }
  assert.equal((await req('/learning-records?from=0000-01-01T00:00:00.000Z')).status,400);
  for (const resource of ['learning-records','star-map']) {
    for (const from of ['abc','2026-99-99T00:00:00.000Z'])
      assert.equal((await req('/'+resource+'?'+new URLSearchParams({from}))).status,400);
  }
  const text='Pagination '+randomUUID();
  async function seed(time, suffix='') {
    const c=(await req('/captures',{originalText:'Page source'})).body;captures.push(c.id);
    const rev=(await req('/captures/'+c.id+'/revisions')).body.items[0];
    const candidate=(await req('/revisions/'+rev.id+'/candidates',{candidateNo:1,englishText:text+suffix,chineseMeaning:'分页样本'})).body;
    const accepted=await req('/candidates/'+candidate.id+'/accept',{operationId:randomUUID()}); assert.equal(accepted.status,201);
    await db.learningRecord.update({where:{id:accepted.body.learningRecord.id},data:{createdAt:new Date(time)}});
    return accepted.body;
  }
  const stamp='2026-01-01T00:00:00.000Z';const saved=[];
  for(let i=0;i<4;i++)saved.push(await seed(stamp));
  const expression=saved[0].expression.id, filter='&expressionId='+expression;
  const expected=saved.map(x=>x.learningRecord.id).sort().reverse();
  const first=(await req('/learning-records?mode=cursor&limit=2'+filter)).body;
  assert.deepEqual(first.items.map(x=>x.id),expected.slice(0,2));assert.ok(first.nextCursor);
  const offsetFirst=(await req('/learning-records?mode=offset&limit=2'+filter)).body;assert.equal(offsetFirst.nextOffset,2);
  const inserted=await seed('2026-01-02T00:00:00.000Z');
  const offsetSecond=(await req('/learning-records?mode=offset&limit=2&offset=2'+filter)).body;
  assert.equal(offsetSecond.items[0].id,first.items[1].id);
  const nextPath='/learning-records?mode=cursor&limit=2'+filter+'&cursor='+first.nextCursor;
  const second=(await req(nextPath)).body;
  assert.deepEqual(second.items.map(x=>x.id),expected.slice(2));assert.equal(second.nextCursor,null);
  await db.learningRecord.delete({where:{id:first.items[1].id}});
  assert.deepEqual((await req(nextPath)).body.items.map(x=>x.id),expected.slice(2));
  const range=await req('/learning-records?mode=cursor&limit=2'+filter+'&from='+stamp+'&to=2026-01-02T00:00:00.000Z');
  assert.equal(range.status,200);assert.equal(range.body.items.some(x=>x.id===inserted.learningRecord.id),false);
  assert.equal((await req(nextPath+'&from='+stamp)).status,400);
  assert.equal((await req('/star-map?mode=cursor&limit=2&cursor='+first.nextCursor)).status,400);
  assert.deepEqual(Object.keys((await req('/learning-records'+ '?expressionId='+expression)).body).sort(),['hasMore','items','limit']);
  const graphRows=[];
  for(let i=0;i<3;i++){const a=await seed(stamp,' unique '+i);graphRows.push(a.expression.id);}
  await db.expression.updateMany({where:{id:{in:graphRows}},data:{createdAt:new Date('2026-02-01T00:00:00.000Z')}});
  const graphQuery='/star-map?mode=cursor&limit=1&from=2026-02-01T00:00:00.000Z&to=2026-02-02T00:00:00.000Z';
  const seen=[];let cursor='';
  do {const r=await req(graphQuery+cursor);assert.equal(r.status,200);seen.push(...r.body.nodes.map(x=>x.id));cursor=r.body.nextCursor?'&cursor='+r.body.nextCursor:'';} while(cursor);
  assert.deepEqual(seen,graphRows.sort().reverse());
});
