import { setTimeout as delay } from 'node:timers/promises';

const mode = process.argv[2] ?? 'drain';
if (!['log-only', 'drain'].includes(mode)) {
  console.error('Usage: node examples/signal-lifetime.js [log-only|drain]');
  process.exitCode = 1;
} else {
  let stopping = false;
  let nextId = 0;
  const pending = new Set();

  async function runJob(id) {
    console.log(`start ${id}`);
    await delay(800);
    console.log(`done ${id}`);
  }

  function scheduleJob() {
    if (stopping) return;
    const job = runJob(++nextId);
    pending.add(job);
    job.then(
      () => pending.delete(job),
      (error) => {
        pending.delete(job);
        console.error(error.message);
        process.exitCode = 1;
      },
    );
  }

  const interval = setInterval(scheduleJob, 300);
  // Keep the deliberate log-only experiment finite.
  const safetyStop = setTimeout(() => {
    stopping = true;
    clearInterval(interval);
    console.error('demo time limit reached');
    process.exitCode = 1;
  }, 10_000);

  async function stop(signal) {
    console.log(`received ${signal}`);
    if (mode === 'log-only' || stopping) return;
    stopping = true;
    clearInterval(interval);
    await Promise.allSettled([...pending]);
    clearTimeout(safetyStop);
    console.log('drained');
  }

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(`ready pid=${process.pid} mode=${mode}`);
  scheduleJob();
}
