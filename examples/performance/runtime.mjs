import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { writeHeapSnapshot } from 'node:v8';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function scoreCandidates(stop) {
  let value = 7;
  while (performance.now() < stop) value = Math.imul(value, 31) + 1;
  return value;
}
class PendingPreview {
  constructor(id) { this.cells = Array.from({ length: 100 }, (_, n) => id + n); }
}
const mode = process.argv[2];
if (mode === 'cpu' || mode === 'wait') {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  await delay(40); // arm the sampling timer before injecting the stall
  const start = performance.now(), cpu = process.cpuUsage();
  if (mode === 'cpu') scoreCandidates(start + 450);
  else await delay(450);
  const elapsed = performance.now() - start, usage = process.cpuUsage(cpu);
  await delay(40);
  histogram.disable();
  console.log({ mode, elapsedMs: Math.round(elapsed), cpuMs: Math.round((usage.user + usage.system) / 1000),
    maxLoopDelayMs: Math.round(histogram.max / 1e6) });
} else if (mode === 'heap' && global.gc) {
  const dir = mkdtempSync(join(tmpdir(), 'epp55-heap-'));
  const open = new Map();
  // Give the owner a stable, inspectable root, even after the last use.
  globalThis.openPreviews = open;
  function snapshot(name) {
    global.gc();
    console.log(writeHeapSnapshot(join(dir, name + '.heapsnapshot')));
  }
  snapshot('01-before');
  for (let i = 0; i < 4000; i++) open.set(i, new PendingPreview(i));
  snapshot('02-held');
  open.clear();
  snapshot('03-released');
} else throw Error('Use cpu, wait, or node --expose-gc with heap.');
