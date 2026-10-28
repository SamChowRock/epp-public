import { parentPort, workerData } from 'node:worker_threads';
import { burnCpu } from './event-loop-work.js';

if (workerData.mode === 'fail') throw new Error('Demo worker failed');
if (workerData.mode !== 'empty') {
  const iterations = burnCpu(600);
  workerData.note = 'changed inside worker';
  parentPort.postMessage({ iterations, note: workerData.note });
}
