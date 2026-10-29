import { CapturesService } from '../dist/src/captures.service.js';
import { MemoryCaptureStore } from '../dist/src/memory-capture.store.js';

function makeEntry(captures) {
  return {
    record: (text) => captures.create(text),
    list: () => captures.list(),
  };
}

const store = new MemoryCaptureStore();
const shared = new CapturesService(store);
const firstEntry = makeEntry(shared);
const secondEntry = makeEntry(shared);
await firstEntry.record('I want to explain this clearly.');
console.log('shared entry count:', (await secondEntry.list()).length);
console.log('another service, same store:',
  (await new CapturesService(store).list()).length);

const isolatedEntry = makeEntry(new CapturesService(new MemoryCaptureStore()));
console.log('isolated entry count:', (await isolatedEntry.list()).length);
