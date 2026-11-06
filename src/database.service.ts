import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import type { DatabaseConfig } from './database-config.js';
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
      // Exercise the columns needed by the API, even when the table is empty.
      await this.client.user.findMany({ take: 1, select: { id: true, status: true, webEnabled: true } });
      await this.client.capture.findMany({ take: 1,
        select: { id: true, userId: true, originalText: true, chineseIntent: true, createdAt: true } });
      await this.client.passwordCredential.findMany({ take: 1, select: { userId: true, passwordHash: true } });
      await this.client.session.findMany({ take: 1 });
      await this.client.captureRevision.findMany({ take: 1 });
      await this.client.candidate.findMany({ take: 1 });
      await this.client.expression.findMany({ take: 1 });
      await this.client.expressionForm.findMany({ take: 1 });
      await this.client.learningRecord.findMany({ take: 1 });
      const constraints = await this.client.$queryRaw<{ definition: string; condeferrable: boolean }[]>`
        SELECT pg_get_constraintdef(oid) AS definition, condeferrable
        FROM pg_constraint WHERE conrelid = 'public.learning_records'::regclass
          AND conname = 'learning_records_candidate_id_key' AND contype = 'u' AND convalidated
      `;
      const constraint = constraints[0];
      if (constraints.length !== 1 || !constraint || constraint.definition !== 'UNIQUE (candidate_id)'
        || constraint.condeferrable) throw Object.assign(new Error('Acceptance constraint is missing'), {
          code: 'ACCEPTANCE_CONSTRAINT_MISSING',
        });
      await this.client.commandReceipt.findMany({ take: 1 });
      const receiptKeys = await this.client.$queryRaw<{ definition: string; condeferrable: boolean }[]>`
        SELECT pg_get_constraintdef(oid) AS definition, condeferrable
        FROM pg_constraint WHERE conrelid = 'public.command_receipts'::regclass
          AND conname = 'command_receipts_pkey' AND contype = 'p' AND convalidated
      `;
      if (receiptKeys.length !== 1 || receiptKeys[0]?.definition !== 'PRIMARY KEY (user_id, operation_id)'
        || receiptKeys[0].condeferrable) throw Object.assign(new Error('Command identity constraint is missing'), {
          code: 'COMMAND_CONSTRAINT_MISSING',
        });
      const expressionKeys = await this.client.$queryRaw<{ definition: string; condeferrable: boolean }[]>`
        SELECT pg_get_constraintdef(oid) AS definition, condeferrable
        FROM pg_constraint WHERE conrelid = 'public.expressions'::regclass
          AND conname = 'expressions_user_semantic_key' AND contype = 'u' AND convalidated
      `;
      if (expressionKeys.length !== 1 || expressionKeys[0]?.definition !== 'UNIQUE (user_id, semantic_key)'
        || expressionKeys[0].condeferrable) throw Object.assign(new Error('Expression identity constraint is missing'), {
          code: 'EXPRESSION_CONSTRAINT_MISSING',
        });
      await this.client.$queryRaw`SELECT public.epp_identity_v1('ready', 'ready')`;
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
