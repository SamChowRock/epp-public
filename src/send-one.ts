import { logLevelSchema, parseMailEndpoint } from './config.js';
import { AppLogger } from './app-logger.js';
import { parseDatabaseConfig } from './database-config.js';
import { DatabaseService } from './database.service.js';
import { LocalMailDelivery } from './verification-delivery.js';
import { sendOne } from './verification-outbox.js';

async function main() {
  const expected = process.argv[2];
  if (!expected || process.argv.length > 4) throw Error('EXPECTED_DATABASE_REQUIRED');
  const endpoint = parseMailEndpoint(process.env);
  const logger = new AppLogger(logLevelSchema.parse(process.env.LOG_LEVEL));
  const database = new DatabaseService(parseDatabaseConfig(process.env), logger, 'epp-worker');
  try {
    const [row] = await database.client.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (row?.name !== expected) throw Error('DATABASE_MISMATCH');
    const result = await sendOne(database, new LocalMailDelivery(endpoint), process.argv[3]);
    console.log(result);
    if (result === 'unknown' || result === 'paused' || result === 'lost-after-send') process.exitCode = 2;
  } finally { await database.onModuleDestroy(); }
}
main().catch(() => {
  console.error('Send-one failed. Check expected database, configuration, migration and task status.');
  process.exitCode = 1;
});
