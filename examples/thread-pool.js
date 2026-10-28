import { pbkdf2 } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const start = performance.now();
const probe = setTimeout(() => {
  console.log(`100 ms probe at ${Math.round(performance.now() - start)} ms`);
}, 100);

function derive(index) {
  return new Promise((resolve, reject) => {
    pbkdf2('demo-only', `demo-salt-${index}`, 200_000, 32, 'sha256', (error) => {
      if (error) reject(error);
      else resolve({ index, completedMs: Math.round(performance.now() - start) });
    });
  });
}

const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => derive(index)));
for (const result of results) {
  if (result.status === 'fulfilled') console.log(result.value);
  else {
    console.error(result.reason.message);
    process.exitCode = 1;
  }
}
// If all work finished quickly, there is no pending responsiveness to observe.
clearTimeout(probe);
