import { setTimeout as delay } from 'node:timers/promises';

const mode = process.argv[2];
if (!['caught', 'detached', 'callback'].includes(mode)) {
  console.error('Usage: node examples/async-failure.js caught|detached|callback');
  process.exitCode = 2;
} else {
  async function work() {
    await delay(20);
    throw new Error('Demo work failed');
  }
  try {
    if (mode === 'caught') await work();
    if (mode === 'detached') work();
    if (mode === 'callback') {
      setTimeout(() => { throw new Error('Demo callback failed'); }, 20);
    }
  } catch (error) {
    console.error(`caught: ${error.message}`);
    process.exitCode = 1;
  }
}
