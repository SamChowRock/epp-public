import { setTimeout as delay } from 'node:timers/promises';

const ids = [1, 2, 3, 4, 5, 6];
const width = 2;
let active = 0;
let peak = 0;

async function inspect(id) {
  active += 1;
  peak = Math.max(peak, active);
  console.log(`start ${id}, active=${active}`);
  try {
    await delay(id % 2 === 0 ? 80 : 30);
    if (id === 3) throw new Error('Demo item 3 failed');
    return { id, status: 'ready' };
  } finally {
    active -= 1;
    console.log(`finish ${id}, active=${active}`);
  }
}

try {
  for (let offset = 0; offset < ids.length; offset += width) {
    const batch = ids.slice(offset, offset + width);
    const results = await Promise.allSettled(batch.map(inspect));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
    console.log(JSON.stringify(results.map((result) => result.value)));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  console.log(`all accepted work settled: active=${active}, peak=${peak}`);
}
