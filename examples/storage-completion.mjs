import { setTimeout as delay } from 'node:timers/promises';
import { CapturesService } from '../dist/src/captures.service.js';
import { MemoryCaptureStore } from '../dist/src/memory-capture.store.js';

const mode = process.argv[2] ?? 'slow';
if (!['slow', 'fail'].includes(mode)) throw new Error('Use slow or fail');
const memory = new MemoryCaptureStore();
const store = {
  async insert(capture) {
    console.log('write started');
    await delay(20);
    if (mode === 'fail') throw new Error('write failed');
    await memory.insert(capture);
    console.log('write finished');
  },
  list: (options) => memory.list(options),
  appendRevision: (id, content) => memory.appendRevision(id, content),
  revisions: (id, before, take) => memory.revisions(id, before, take),
  updateIntent: (id, intent) => memory.updateIntent(id, intent),
  find: (id) => memory.find(id),
};
const captures = new CapturesService(store);
const pending = captures.create('I want to keep this sentence.');
console.log('caller has a Promise, not a saved record');
try {
  await pending;
  console.log('creation succeeded');
} catch (error) {
  console.log('creation failed:', error.message);
}
console.log('stored count:', (await memory.list({})).length);
