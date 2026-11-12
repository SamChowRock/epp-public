import type { RequestHandler, Response } from 'express';
import type { AppConfig } from './config.js';
import type { AuthenticatedRequest } from './auth-context.js';
import { SessionService, SESSION_SECONDS } from './session.service.js';
import { HttpError } from './http.js';

export const sessionCookieName = (config: AppConfig) => config.appOrigin.startsWith('https:') ? '__Host-epp_session' : 'epp_session';
const cookieOptions = (config: AppConfig) => ({ path: '/', httpOnly: true, sameSite: 'strict' as const,
  secure: config.appOrigin.startsWith('https:') });
export function setSessionCookie(response: Response, config: AppConfig, token: string): void {
  response.cookie(sessionCookieName(config), token, { ...cookieOptions(config), maxAge: SESSION_SECONDS * 1000 });
}
export function clearSessionCookie(response: Response, config: AppConfig): void {
  response.clearCookie(sessionCookieName(config), cookieOptions(config));
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  if (header.length > 4096) throw new HttpError(400, 'Cookie header is too large', 'COOKIE_INVALID');
  const matches = header.split(';').map(part => part.trim()).filter(part => part.slice(0, part.indexOf('=')) === name);
  if (matches.length > 1) throw new HttpError(400, 'Duplicate session cookie', 'COOKIE_INVALID');
  return matches[0]?.slice(name.length + 1);
}

export const privateResponses: RequestHandler = (_request, response, next) => {
  response.setHeader('Cache-Control', 'private, no-store');
  response.vary('Cookie');
  next();
};

export function sessionBoundary(service: SessionService, config: AppConfig): RequestHandler {
  // shortcut: per-process limits for the loopback chapter; chapter 40 covers browser boundaries; chapter 41 covers shared instance quotas.
  const attempts = new Map<string, { until: number; count: number }>();
  return (request: AuthenticatedRequest, response, next) => {
    void (async () => {
      const path = request.url.split('?')[0];
      if (request.method === 'DELETE' && (request.headers['transfer-encoding'] !== undefined
        || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0'))) {
        throw new HttpError(400, 'DELETE does not accept a body', 'BODY_NOT_ALLOWED');
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        if ((request.headers.origin !== undefined && request.headers.origin !== config.appOrigin)
          || request.headers['sec-fetch-site'] === 'cross-site') {
          throw new HttpError(403, 'Request origin is not allowed', 'ORIGIN_REJECTED');
        }
      }
      if (path === '/auth/login' || path === '/auth/password') {
        const now = Date.now();
        for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
        const key = request.socket.remoteAddress ?? 'unknown';
        let entry = attempts.get(key);
        if (!entry) {
          if (attempts.size >= 1000) throw new HttpError(429, 'Try again later', 'AUTH_RATE_LIMIT');
          entry = { until: now + 60000, count: 0 }; attempts.set(key, entry);
        }
        if (++entry.count > 10) {
          response.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
          throw new HttpError(429, 'Try again later', 'AUTH_RATE_LIMIT');
        }
      }
      if (path === '/auth/login') return;
      const token = readCookie(request.headers.cookie, sessionCookieName(config));
      const identity = token === undefined ? undefined : await service.authenticate(token);
      if (identity) request.auth = Object.freeze(identity);
      else if (path !== '/auth/logout') throw new HttpError(401, 'Authentication required', 'AUTH_REQUIRED');
    })().then(() => next(), (error: unknown) => { response.setHeader('Connection', 'close'); next(error); });
  };
}
