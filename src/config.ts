import { readFile } from 'node:fs/promises';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');
export type AppConfig = Readonly<{
  port: number;
  mode: 'development' | 'test' | 'production';
  docsEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  shutdownTimeoutMs: number;
}>;
export class ConfigError extends Error {
  constructor(readonly field: string) { super(`Invalid configuration: ${field}`); }
}
const DefaultsSchema = z.object({ port: z.number().int().min(1).max(65535) });
const decimal = (max: number) => z.string().regex(/^[0-9]+$/)
  .transform(Number).pipe(z.number().int().min(1).max(max));
const EnvironmentSchema = z.object({
  PORT: decimal(65535).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DOCS_ENABLED: z.enum(['true', 'false']).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHUTDOWN_TIMEOUT_MS: decimal(30000).default(5000),
});

export function parseConfig(defaults: unknown, env: NodeJS.ProcessEnv): AppConfig {
  const file = DefaultsSchema.safeParse(defaults);
  if (!file.success) throw new ConfigError('config/service.json.port');
  const parsed = EnvironmentSchema.safeParse(env);
  if (!parsed.success) {
    // Only a schema-owned field name is reported, never its value or Zod dump.
    throw new ConfigError(String(parsed.error.issues[0]?.path[0] ?? 'environment'));
  }
  const value = parsed.data;
  return Object.freeze({
    port: value.PORT ?? file.data.port,
    mode: value.NODE_ENV,
    docsEnabled: value.DOCS_ENABLED === undefined
      ? value.NODE_ENV === 'development' : value.DOCS_ENABLED === 'true',
    logLevel: value.LOG_LEVEL,
    shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS,
  });
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<AppConfig> {
  let text: string;
  try { text = await readFile(new URL('../config/service.json', import.meta.url), 'utf8'); }
  catch { throw new ConfigError('config/service.json: unreadable'); }
  let defaults: unknown;
  try { defaults = JSON.parse(text); }
  catch { throw new ConfigError('config/service.json: invalid JSON'); }
  return parseConfig(defaults, env);
}
