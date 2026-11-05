import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningQuerySchema } from '../dist/src/learning-contract.js';

test('pagination accepts explicit modes and rejects ambiguous or invalid time boundaries', () => {
  assert.equal(LearningQuerySchema.safeParse({ mode: 'cursor', limit: '2' }).success, true);
  assert.equal(LearningQuerySchema.safeParse({ mode: 'offset', offset: '0' }).success, true);
  assert.equal(LearningQuerySchema.safeParse({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' }).success, true);
  for (const q of [{offset:'1'}, {mode:'cursor',offset:'0'}, {mode:'offset',cursor:'abc'},
    {mode:'offset',offset:'10001'}, {mode:'offset',offset:'01'}, {from:'2026-02-30T00:00:00.000Z'}, {from:'0000-01-01T00:00:00.000Z'},
    {from:'abc'}, {from:'2026-99-99T00:00:00.000Z'}, {from:'2026-01-01'}, {from:'2026-01-02T00:00:00.000Z',to:'2026-01-01T00:00:00.000Z'}]) {
    assert.equal(LearningQuerySchema.safeParse(q).success, false, JSON.stringify(q));
  }
});

import { pageRequest, pageResult } from '../dist/src/pagination.js';
import { parseConfig } from '../dist/src/config.js';
import { createHmac } from 'node:crypto';
const key = 'ab'.repeat(32), owner = '10000000-0000-4000-8000-000000000001';
test('signed boundary binds scope and expiry and uses last returned row', () => {
  const query = { mode: 'cursor', limit: '1' };
  const rows = [1, 2].map(n => ({ id: `20000000-0000-4000-8000-00000000000${n}`, createdAt: new Date('2026-01-01T00:00:00.000Z') }));
  const p = pageRequest(query, 'learning-records', owner, key);
  const token = pageResult(p, rows, key).nextCursor;
  const next = pageRequest({ ...query, cursor: token }, 'learning-records', owner, key);
  assert.equal(next.where.OR[1].id.lt, rows[0].id);
  assert.equal(next.expires, p.expires);
  assert.equal(pageResult(p, rows.slice(0,1), key).nextCursor, null);
  for (const [q,resource,user,k] of [
    [{...query,limit:'2'},'learning-records',owner,key],
    [query,'star-map',owner,key], [query,'learning-records','another-user',key],
    [{...query,from:'2026-01-01T00:00:00.000Z'},'learning-records',owner,key],
    [query,'learning-records',owner,'cd'.repeat(32)],
  ]) assert.throws(()=>pageRequest({...q,cursor:token},resource,user,k), e=>e.statusCode===400 && e.code==='INVALID_CURSOR');
  assert.throws(()=>pageRequest({...query,cursor:token.slice(0,-4)+'abcd'},'learning-records',owner,key));
  const expiredBody = Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(token.split('.')[0],'base64url')),expires:1})).toString('base64url');
  const expired = expiredBody+'.'+createHmac('sha256',Buffer.from(key,'hex')).update(expiredBody).digest('base64url');
  assert.throws(()=>pageRequest({...query,cursor:expired},'learning-records',owner,key));
  assert.deepEqual(pageResult(pageRequest({mode:'offset',offset:'10000',limit:'1'},'learning-records',owner,key),rows,key),{nextOffset:null});
  assert.throws(()=>parseConfig({port:3000},{NODE_ENV:'production'}),/CURSOR_HMAC_KEY/);
  assert.equal(parseConfig({port:3000},{NODE_ENV:'production',CURSOR_HMAC_KEY:key}).cursorKey,key);
});
