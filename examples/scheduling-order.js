import { readFile } from 'node:fs';
import { performance } from 'node:perf_hooks';

console.log('module start');
process.nextTick(() => console.log('top nextTick'));
queueMicrotask(() => console.log('top microtask'));
Promise.resolve().then(() => console.log('top promise'));
console.log('module end');

readFile(new URL('../config/service.json', import.meta.url), (error) => {
  if (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  console.log('I/O callback');
  process.nextTick(() => console.log('I/O nextTick'));
  queueMicrotask(() => console.log('I/O microtask'));
  Promise.resolve().then(() => console.log('I/O promise'));
  setTimeout(() => console.log('I/O timeout'), 0);
  setImmediate(() => console.log('I/O immediate'));
});

// A finite chain lets us observe starvation without leaving an infinite loop.
if (process.argv.includes('--starve')) {
  const start = performance.now();
  setTimeout(() => console.log(`probe after ${Math.round(performance.now() - start)} ms`), 0);
  function again() {
    if (performance.now() - start < 300) queueMicrotask(again);
  }
  queueMicrotask(again);
}
