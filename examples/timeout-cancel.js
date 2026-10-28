import { setTimeout as delay } from 'node:timers/promises';
import { withDeadline } from './deadline.js';

const mode = process.argv[2] ?? 'cancel';
if (!['race', 'cancel', 'fast'].includes(mode)) {
  console.error('Usage: node examples/timeout-cancel.js race|cancel|fast');
  process.exitCode = 2;
} else {
  async function work(signal) {
    try {
      await delay(mode === 'fast' ? 20 : 600, undefined, { signal });
      console.log('work completed');
      return 'result';
    } finally {
      console.log('work cleanup');
    }
  }

  let timer;
  try {
    if (mode === 'race') {
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Caller stopped waiting')), 100);
      });
      await Promise.race([work(), timeout]);
    } else {
      console.log(await withDeadline(work, 100));
    }
  } catch (error) {
    console.log(`caller: ${error.name}: ${error.message}`);
  } finally {
    clearTimeout(timer);
    console.log('caller cleanup');
  }
}
