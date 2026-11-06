import { hash, argon2id } from 'argon2';
import { performance } from 'node:perf_hooks';

// Separate processes give each sample its own lifetime peak RSS.
const memoryCost = Number(process.argv[2] ?? 19456);
const count = Number(process.argv[3] ?? 1);
if (![19456, 65536].includes(memoryCost) || ![1, 4, 8].includes(count)) {
  throw new Error('Use memory 19456 or 65536 and concurrency 1, 4 or 8');
}
const started = performance.now();
const durations = await Promise.all(Array.from({ length: count }, async () => {
  const begin = performance.now();
  await hash('Fabricated capacity sample only', { type: argon2id, memoryCost, timeCost: 2, parallelism: 1 });
  return Math.round(performance.now() - begin);
}));
console.log(JSON.stringify({ memoryKiB: memoryCost, submitted: count,
  poolSize: process.env.UV_THREADPOOL_SIZE ?? '4 (default)',
  durationMs: durations, totalMs: Math.round(performance.now() - started),
  maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024) }));
