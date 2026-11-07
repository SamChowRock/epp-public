import { MINI_PUBLIC_PATHS } from './mini-contract.js';
import { RECOVERY_PATHS } from './recovery-contract.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { AppConfig } from './config.js';
import { HttpError } from './http.js';

export function csrfToken(key: string, sessionId: string): string {
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update('epp:csrf:v1:' + sessionId).digest('hex');
}

export function requireCsrf(value: unknown, key: string, sessionId: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)
    || !timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(csrfToken(key, sessionId), 'hex'))) {
    throw new HttpError(403, 'CSRF token is missing or invalid', 'CSRF_REJECTED');
  }
}

export function browserBoundary(config: AppConfig): RequestHandler {
  return (request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    // Swagger serves its own executable document; keep the API's restrictive CSP separate.
    if (!(config.docsEnabled && /^\/(?:docs(?:\/|$)|openapi\.json$)/.test(request.path))) {
      response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    }
    if (config.appOrigin.startsWith('https:')) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if ((request.headers.origin !== undefined && request.headers.origin !== config.appOrigin)
        || ['cross-site', 'same-site'].includes(String(request.headers['sec-fetch-site']))) {
        response.setHeader('Connection', 'close');
        next(new HttpError(403, 'Request origin is not allowed', 'ORIGIN_REJECTED')); return;
      }
      if (request.headers['x-epp-request'] !== '1') {
        response.setHeader('Connection', 'close');
        next(new HttpError(403, 'Explicit API request header is required', 'REQUEST_HEADER_REQUIRED')); return;
      }
    }
    next();
  };
}

export function authRateLimit(): RequestHandler {
  // shortcut: bounded per-process buckets; use a shared atomic store before multiple API instances.
  const attempts = new Map<string, { until: number; count: number }>();
  return (request, response, next) => {
    if (request.method !== 'POST' || !['/auth/oidc/start', '/auth/login', '/auth/password', ...RECOVERY_PATHS, ...MINI_PUBLIC_PATHS].includes(request.path)) { next(); return; }
    const now = performance.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    let entry = attempts.get(key);
    if (!entry && attempts.size < 1000) {
      entry = { until: now + 60000, count: 0 }; attempts.set(key, entry);
    }
    if (!entry || ++entry.count > 10) {
      response.setHeader('Retry-After', String(entry ? Math.max(1, Math.ceil((entry.until - now) / 1000)) : 60));
      response.setHeader('Connection', 'close');
      next(new HttpError(429, 'Try again later', 'AUTH_RATE_LIMIT')); return;
    }
    next();
  };
}
