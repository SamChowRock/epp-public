import { isIP } from 'node:net';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');
export type AppConfig = Readonly<{
  trustedProxyIps: readonly string[];
  cursorKey: string;
  appOrigin: string;
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
  APP_ORIGIN: z.string().optional(),
  TRUST_PROXY_IPS: z.string().optional(),
  CURSOR_HMAC_KEY: z.string().regex(/^[0-9a-f]{64}$/).optional(),
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
  if (value.NODE_ENV === 'production' && !value.CURSOR_HMAC_KEY) throw new ConfigError('CURSOR_HMAC_KEY');
  if (value.NODE_ENV === 'production' && !value.APP_ORIGIN) throw new ConfigError('APP_ORIGIN');
  const appOrigin = value.APP_ORIGIN ?? `http://127.0.0.1:${value.PORT ?? file.data.port}`;
  try {
    const origin = new URL(appOrigin);
    if (origin.origin !== appOrigin || origin.username || origin.password
      || !['http:', 'https:'].includes(origin.protocol)
      || (origin.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))) {
      throw new Error('Invalid origin');
    }
  } catch { throw new ConfigError('APP_ORIGIN'); }
  const trustedProxyIps = value.TRUST_PROXY_IPS === undefined ? [] : value.TRUST_PROXY_IPS.split(',');
  if (trustedProxyIps.length > 10 || trustedProxyIps.some(ip => !isIP(ip))) throw new ConfigError('TRUST_PROXY_IPS');
  return Object.freeze({
    trustedProxyIps: Object.freeze(trustedProxyIps),
    appOrigin,
    cursorKey: value.CURSOR_HMAC_KEY ?? randomBytes(32).toString('hex'),
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
