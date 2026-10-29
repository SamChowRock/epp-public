import { CapturesService } from '../dist/src/captures.service.js';

function makeEntry(captures) {
  return {
    record: (text) => captures.create(text),
    list: () => captures.list(),
  };
}

const shared = new CapturesService();
const firstEntry = makeEntry(shared);
const secondEntry = makeEntry(shared);
firstEntry.record('I want to explain this clearly.');
console.log('shared entry count:', secondEntry.list().length);

const isolatedEntry = makeEntry(new CapturesService());
console.log('isolated entry count:', isolatedEntry.list().length);
