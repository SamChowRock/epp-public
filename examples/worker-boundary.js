import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { burnCpu } from './event-loop-work.js';

const mode = process.argv[2] ?? 'worker';
const allowed = ['main', 'worker', 'fail', 'empty', 'timeout'];
if (!allowed.includes(mode)) {
  console.error(`Usage: node examples/worker-boundary.js ${allowed.join('|')}`);
  process.exitCode = 2;
} else {
  const start = performance.now();
  const input = { mode, note: 'owned by parent' };
  const probe = setTimeout(() => {
    console.log(`100 ms probe at ${Math.round(performance.now() - start)} ms`);
  }, 100);
  let worker;
  let deadlineTimer;
  let expired = false;
  try {
    if (mode === 'main') {
      console.log({ iterations: burnCpu(600) });
    } else {
      worker = new Worker(new URL('./cpu-worker.js', import.meta.url), { workerData: input });
      const result = await new Promise((resolve, reject) => {
        let message;
        let received = false;
        let failure;
        worker.on('message', (value) => {
          received = true;
          message = value;
        });
        worker.on('error', (error) => { failure = error; });
        worker.on('messageerror', (error) => {
          failure = error;
          void worker.terminate().catch(reject);
        });
        worker.on('exit', (code) => {
          if (expired) reject(new Error('Worker deadline exceeded'));
          else if (failure) reject(failure);
          else if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
          else if (!received) reject(new Error('Worker exited without a result'));
          else resolve(message);
        });
        deadlineTimer = setTimeout(() => {
          expired = true;
          void worker.terminate().catch(reject);
        }, mode === 'timeout' ? 100 : 5000);
      });
      console.log(result);
    }
    console.log(`parent note: ${input.note}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadlineTimer);
    if (worker) await worker.terminate();
    // The finite probe is intentionally retained for the blocking comparison.
    if (mode === 'empty' || mode === 'fail') clearTimeout(probe);
  }
}
