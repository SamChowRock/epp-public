import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const context = new AsyncLocalStorage();
let currentId;
async function work(id, milliseconds) {
  currentId = id;
  return context.run({ requestId: id }, async () => {
    await delay(milliseconds);
    console.log({ expected: id, global: currentId, scoped: context.getStore()?.requestId });
  });
}
await Promise.all([work('A', 25), work('B', 5)]);
console.log('outside:', context.getStore());

const bus = new EventEmitter();
context.run({ requestId: 'C' }, () => {
  bus.on('plain', () => console.log('plain:', context.getStore()?.requestId));
  bus.on('bound', AsyncLocalStorage.bind(() => console.log('bound:', context.getStore()?.requestId)));
});
bus.emit('plain');
bus.emit('bound');
bus.removeAllListeners();
context.disable();
