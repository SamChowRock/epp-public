import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import type { DatabaseConfig } from './database-config.js';
import { DEVELOPMENT_USER_ID } from './database-config.js';
import { AppLogger } from './app-logger.js';
import { databaseFailure, StorageFailureError, StorageUnavailableError } from './database-errors.js';

export class DatabaseService {
  readonly pool: pg.Pool;
  readonly client: PrismaClient<'query'>;
  private closing?: Promise<void>;

  constructor(config: DatabaseConfig, private readonly logger: AppLogger) {
    this.pool = new pg.Pool({
      connectionString: config.url, max: config.poolMax,
      connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000,
      statement_timeout: 3000, application_name: 'epp-api',
      options: '-c TimeZone=UTC',
    });
    this.pool.on('error', error => {
      this.logger.write('error', 'database.idle_error', { code: databaseFailure(error).code });
    });
    const adapter = new PrismaPg(this.pool, { schema: 'public', disposeExternalPool: false });
    this.client = new PrismaClient({ adapter,
      log: config.queryDebug ? [{ emit: 'event', level: 'query' }] : [],
    });
    this.client.$on('query', event => {
      // Break here with fabricated data to inspect event.query and event.params locally.
      this.logger.write('debug', 'database.query', { durationMs: event.duration });
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
      const user = await this.client.user.findUnique({
        where: { id: DEVELOPMENT_USER_ID }, select: { id: true },
      });
      if (!user) throw Object.assign(new Error('Development user is missing'), { code: 'DEV_USER_MISSING' });
      // Exercise the columns needed by the API, even when the table is empty.
      await this.client.capture.findMany({ take: 1,
        select: { id: true, userId: true, originalText: true, chineseIntent: true, createdAt: true } });
      await this.client.captureRevision.findMany({ take: 1 });
      const missing = await this.client.capture.findFirst({ where: { revisions: { none: {} } }, select: { id: true } });
      if (missing) throw new StorageFailureError();
      this.logger.write('info', 'database.ready');
    } catch (error) {
      this.logger.write('error', 'database.start_failed', { code: databaseFailure(error).code });
      await this.close();
      throw new StorageFailureError();
    }
  }

  async run<T>(operation: string, work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      const failure = databaseFailure(error);
      this.logger.write('error', 'database.failed', { operation, code: failure.code,
        total: this.pool.totalCount, idle: this.pool.idleCount, waiting: this.pool.waitingCount });
      throw failure.unavailable ? new StorageUnavailableError() : new StorageFailureError();
    }
  }

  private close(): Promise<void> {
    return this.closing ??= (async () => {
      try { await this.client.$disconnect(); }
      finally { await this.pool.end(); }
      this.logger.write('info', 'database.closed');
    })();
  }
  onModuleDestroy(): Promise<void> { return this.close(); }
}
