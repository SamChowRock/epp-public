import { isIP } from 'node:net';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');
export type AppConfig = Readonly<{
  oidc?: Readonly<{ issuer: string; clientId: string; secret: string }>;
  wechatWeb?: Readonly<{ appId: string; secret: string }>;
  wechat?: Readonly<{ appId: string; secret: string }>;
  localSmtpPort: number;
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
  OIDC_ISSUER: z.string().min(1).max(512).optional(),
  OIDC_CLIENT_ID: z.string().min(1).max(256).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).max(4096).optional(),
  WECHAT_WEB_APP_ID: z.string().regex(/^wx[0-9a-f]{16}$/).optional(),
  WECHAT_WEB_APP_SECRET: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  WECHAT_APP_ID: z.string().regex(/^wx[0-9a-f]{16}$/).optional(),
  WECHAT_APP_SECRET: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  LOCAL_SMTP_PORT: decimal(65535).default(1025),
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
  if (Boolean(value.WECHAT_APP_ID) !== Boolean(value.WECHAT_APP_SECRET)) throw new ConfigError('WECHAT_APP_ID/WECHAT_APP_SECRET');
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
  const { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, OIDC_CLIENT_SECRET: secret } = value;
  if (issuer || clientId || secret) {
    if (!issuer || !clientId || !secret) throw new ConfigError('OIDC_ISSUER/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET');
    try {
      const u = new URL(issuer);
      const lab = value.NODE_ENV === 'test' && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
      if ((!lab && u.protocol !== 'https:') || u.username || u.password || u.search || u.hash
        || issuer.includes('/.well-known/') || Buffer.byteLength(issuer) > 512
        || (value.NODE_ENV === 'production' && !appOrigin.startsWith('https:'))) throw new Error();
    } catch { throw new ConfigError('OIDC_ISSUER/APP_ORIGIN'); }
  }
  const webId = value.WECHAT_WEB_APP_ID, webSecret = value.WECHAT_WEB_APP_SECRET;
  if (Boolean(webId) !== Boolean(webSecret) || (webId && webId === value.WECHAT_APP_ID))
    throw new ConfigError('WECHAT_WEB_APP_ID/WECHAT_WEB_APP_SECRET');
  if (webId && value.NODE_ENV !== 'test' && !appOrigin.startsWith('https:'))
    throw new ConfigError('WECHAT_WEB_APP_ID/APP_ORIGIN');
  const trustedProxyIps = value.TRUST_PROXY_IPS === undefined ? [] : value.TRUST_PROXY_IPS.split(',');
  if (trustedProxyIps.length > 10 || trustedProxyIps.some(ip => !isIP(ip))) throw new ConfigError('TRUST_PROXY_IPS');
  return Object.freeze({
    ...(webId && webSecret ? { wechatWeb: Object.freeze({ appId: webId, secret: webSecret }) } : {}),
    ...(issuer && clientId && secret ? { oidc: Object.freeze({ issuer, clientId, secret }) } : {}),
    ...(value.WECHAT_APP_ID && value.WECHAT_APP_SECRET ? { wechat: Object.freeze({ appId: value.WECHAT_APP_ID, secret: value.WECHAT_APP_SECRET }) } : {}),
    localSmtpPort: value.LOCAL_SMTP_PORT,
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
