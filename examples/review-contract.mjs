import { randomUUID } from 'node:crypto';
import { ArrayCaptureStore } from '../dist/src/array-capture.store.js';
import { MemoryCaptureStore } from '../dist/src/memory-capture.store.js';
import { CapturesService } from '../dist/src/captures.service.js';
import { CreateCaptureSchema, toCaptureResponse } from '../dist/src/capture-contract.js';

console.log('input 1200:', CreateCaptureSchema.safeParse({ originalText: 'x'.repeat(1200) }).success);
console.log('input 1201:', CreateCaptureSchema.safeParse({ originalText: 'x'.repeat(1201) }).success);
for (const Store of [MemoryCaptureStore, ArrayCaptureStore]) {
  const store = new Store();
  const service = new CapturesService(store);
  const legacy = { id: randomUUID(), originalText: 'x'.repeat(1500), createdAt: new Date().toISOString() };
  // Model a record accepted by the old rule; this is not a migration or an HTTP route.
  await store.insert(legacy);
  legacy.originalText = 'caller changed its own input';
  const found = await service.find(legacy.id);
  console.log(Store.name, 'old response length:', toCaptureResponse(found).originalText.length);
  found.originalText = 'caller changed its own result';
  console.log('stored copy length:', (await service.find(legacy.id)).originalText.length);
  const before = (await service.list()).length;
  try { await service.create('x'.repeat(1201)); }
  catch (error) { console.log('direct create rejected:', error.constructor.name); }
  console.log('invalid create changed count:', (await service.list()).length !== before);
  await service.create('no match');
  await service.create('match first');
  await service.create('match second');
  console.log('filter before limit:', (await service.list({ text: 'match ', limit: 1 })).map(x => x.originalText));
  const list = await service.list();
  list[0].originalText = 'changed list item';
  list.length = 0;
  console.log('list mutation changed stored value:', (await service.find(legacy.id)).originalText.length !== 1500);
}
