import { DatabaseService } from './database.service.js';
import { parseDatabaseConfig } from './database-config.js';
import { AppLogger } from './app-logger.js';
import { loadReceiptConfig } from './mail-receipt-config.js';
import { createReceiptServer } from './mail-receipt-server.js';
async function main() {
  const expected = process.argv[2];
  if (!expected || process.argv.length !== 3)
    throw Error('EXPECTED_DATABASE_REQUIRED');
  const config = loadReceiptConfig(process.env),
    database = new DatabaseService(
      parseDatabaseConfig(process.env),
      new AppLogger('info'),
      'epp-mail-receipts',
    );
  const server = createReceiptServer(database, config);
  let draining = false;
  const drain = async () => {
    if (draining) return;
    draining = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    try {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections();
      });
      await database.onModuleDestroy();
      console.log('receipts.closed');
    } finally {
      clearTimeout(deadline);
    }
  };
  try {
    const [row] = await database.client.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;
    if (row?.name !== expected) throw Error('DATABASE_MISMATCH');
    await database.onModuleInit();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, '127.0.0.1', resolve);
    });
    process.once('SIGTERM', drain);
    process.once('SIGINT', drain);
    console.log('receipts.ready');
  } catch {
    await database.onModuleDestroy();
    throw Error('RECEIPTS_START_FAILED');
  }
}
main().catch(() => {
  console.error('RECEIPTS_START_FAILED');
  process.exitCode = 1;
});
