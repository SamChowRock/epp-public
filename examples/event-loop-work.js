import { performance } from 'node:perf_hooks';
import { setImmediate as yieldToLoop } from 'node:timers/promises';

export function burnCpu(milliseconds) {
  const start = performance.now();
  let iterations = 0;
  while (performance.now() - start < milliseconds) iterations += 1;
  return iterations;
}

export async function burnInSlices(rounds = 60, sliceMs = 10) {
  let iterations = 0;
  for (let round = 0; round < rounds; round += 1) {
    iterations += burnCpu(sliceMs);
    await yieldToLoop();
  }
  return iterations;
}
