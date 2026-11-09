import 'reflect-metadata';
import { setTimeout as sleep } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppLogger } from './app-logger.js';
import { ConfigError } from './config.js';
import { DatabaseService } from './database.service.js';
import { MailWorkerModule } from './mail-worker.module.js';
import { LocalMailDelivery } from './verification-delivery.js';
import { sendOne } from './verification-outbox.js';

async function main() {
  const expected = process.argv[2];
  if (!expected || process.argv.length !== 3) throw new ConfigError('expected_database_argument');
  const stop = new AbortController();
  let context: INestApplicationContext | undefined;
  let logger = new AppLogger('info');
  let deadline: NodeJS.Timeout | undefined;
  function drain(signal: NodeJS.Signals) {
    if (stop.signal.aborted) return;
    logger.write('info', 'worker.draining', { signal });
    stop.abort();
    deadline = setTimeout(() => {
      logger.write('error', 'worker.failed', { code: 'DRAIN_TIMEOUT' });
      process.exit(1);
    }, 10000);
    deadline.unref();
  }
  process.on('SIGINT', drain);
  process.on('SIGTERM', drain);
  try {
    context = await NestFactory.createApplicationContext(MailWorkerModule.register(process.env),
      { logger: false, abortOnError: false });
    logger = context.get(AppLogger);
    const database = context.get(DatabaseService);
    const delivery = context.get(LocalMailDelivery);
    const [row] = await database.client.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (row?.name !== expected) throw new ConfigError('expected_database_argument');
    if (!stop.signal.aborted) logger.write('info', 'worker.ready');
    while (!stop.signal.aborted) {
      const status = await sendOne(database, delivery);
      if (status === 'empty') {
        try { await sleep(1000, undefined, { signal: stop.signal }); }
        catch (error) { if (!stop.signal.aborted) throw error; }
        continue;
      }
      const halted = status === 'unknown' || status === 'paused';
      logger.write(halted ? 'warn' : 'info', 'worker.result', { code: status });
      if (halted) {
        process.exitCode = 2;
        break;
      }
    }
  } finally {
    try {
      await context?.close();
      if (context) logger.write('info', 'worker.closed');
    } finally {
      clearTimeout(deadline);
      process.off('SIGINT', drain);
      process.off('SIGTERM', drain);
    }
  }
}
main().catch(error => {
  new AppLogger('error').write('error', 'worker.failed', {
    code: error instanceof ConfigError ? 'CONFIG_INVALID' : 'WORKER_FAILURE',
    field: error instanceof ConfigError ? error.field : undefined,
  });
  process.exitCode = 1;
});
