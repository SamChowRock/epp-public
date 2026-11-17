import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import { HttpError } from './http.js';

export const AUTH_RATE_RULE = 'password-auth/v1';
// Two-int advisory lock namespace: ASCII EPP (0x455050), rule 41.
// This is distinct from PostgreSQL's single-bigint advisory lock space.
export const AUTH_RATE_LOCK = [4542544, 41] as const;
export class SharedAuthRateLimiter {
  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState) {}

  // API-only readiness check: workers need neither this table nor its privileges.
  async onModuleInit(): Promise<void> {
    await this.database.run('probeAuthRate', () => this.database.client.authRateBucket.findMany({ take: 1,
      select: { ruleKey: true, sourceKey: true, openedAt: true, expiresAt: true, used: true } }));
  }

  async consume(source: string): Promise<{ allowed: boolean; retryAfter: number }> {
    if (this.state.draining) throw new HttpError(503, 'Service is shutting down', 'SERVICE_DRAINING');
    try {
      return await this.state.track(() => this.database.run('consumeAuthRate', () =>
        this.database.client.$transaction(async tx => {
          await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
          // Separate statement: a waiter must get a NEW READ COMMITTED snapshot after the lock.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(4542544::int, 41::int)::text`;
          const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
          const now = clock!.now;
          await tx.$executeRaw`DELETE FROM public.auth_rate_buckets WHERE (rule_key, source_key) IN (
            SELECT rule_key, source_key FROM public.auth_rate_buckets
            WHERE rule_key = ${AUTH_RATE_RULE} AND expires_at <= ${now}
            ORDER BY expires_at, source_key LIMIT 100
          )`;
          const key = { ruleKey: AUTH_RATE_RULE, sourceKey: source };
          const bucket = await tx.authRateBucket.findUnique({ where: { ruleKey_sourceKey: key } });
          if (bucket && bucket.expiresAt > now) {
            if (bucket.used >= 10) return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000)) };
            await tx.authRateBucket.update({ where: { ruleKey_sourceKey: key }, data: { used: { increment: 1 } } });
          } else {
            // An expired current row may survive the bounded batch; reset it without adding a row.
            if (!bucket && await tx.authRateBucket.count({ where: { ruleKey: AUTH_RATE_RULE } }) >= 1000) {
              return { allowed: false, retryAfter: 60 };
            }
            const data = { openedAt: now, expiresAt: new Date(now.getTime() + 60000), used: 1 };
            await tx.authRateBucket.upsert({ where: { ruleKey_sourceKey: key }, create: { ...key, ...data }, update: data });
          }
          return { allowed: true, retryAfter: 0 };
        }, { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 5000 })));
    } catch {
      // A failed/unknown commit never permits password work or falls back to process memory.
      throw new HttpError(503, 'Authentication rate service is unavailable', 'AUTH_RATE_UNAVAILABLE');
    }
  }
}
