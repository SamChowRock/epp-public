import { z } from 'zod';
import { ConfigError } from './config.js';

export const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');
export const DEVELOPMENT_USER_ID = '10000000-0000-4000-8000-000000000001';
const positive = (max: number) => z.string().regex(/^[1-9][0-9]*$/)
  .transform(Number).pipe(z.number().int().max(max));
const Schema = z.object({
  DATABASE_URL: z.string().min(1).refine(value => {
    try {
      const url = new URL(value);
      return ['postgres:', 'postgresql:'].includes(url.protocol)
        && !!url.hostname && !!url.username && url.pathname.length > 1
        && !url.hash && [...url.searchParams.keys()].every(key => key === 'schema')
        && url.searchParams.getAll('schema').length <= 1
        && (!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public');
    } catch { return false; }
  }),
  DB_POOL_MAX: positive(20).default(5),
  DB_QUERY_DEBUG: z.enum(['true', 'false']).default('false'),
});
export type DatabaseConfig = Readonly<{
  url: string; poolMax: number; queryDebug: boolean;
}>;
export function parseDatabaseConfig(env: NodeJS.ProcessEnv): DatabaseConfig {
  const result = Schema.safeParse(env);
  if (!result.success) throw new ConfigError(String(result.error.issues[0]?.path[0] ?? 'database'));
  if (result.data.DB_QUERY_DEBUG === 'true' && env.NODE_ENV !== 'development') {
    throw new ConfigError('DB_QUERY_DEBUG');
  }
  // CLI schema is not a pg connection option. The adapter uses explicit public below.
  const url = new URL(result.data.DATABASE_URL);
  url.search = '';
  return Object.freeze({ url: url.toString(), poolMax: result.data.DB_POOL_MAX,
    queryDebug: result.data.DB_QUERY_DEBUG === 'true' });
}
