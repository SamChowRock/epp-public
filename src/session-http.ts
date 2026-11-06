import { requireCsrf } from './browser-security.js';
import type { RequestHandler, Response } from 'express';
import type { AppConfig } from './config.js';
import type { AuthenticatedRequest } from './auth-context.js';
import { SessionService, SESSION_SECONDS } from './session.service.js';
import { HttpError } from './http.js';
import { requireWebAccess } from './account-access.js';

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
  return (request: AuthenticatedRequest, response, next) => {
    void (async () => {
      const path = request.url.split('?')[0];
      if (request.method === 'DELETE' && (request.headers['transfer-encoding'] !== undefined
        || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0'))) {
        throw new HttpError(400, 'DELETE does not accept a body', 'BODY_NOT_ALLOWED');
      }
      if (path === '/auth/login') return;
      const token = readCookie(request.headers.cookie, sessionCookieName(config));
      const identity = token === undefined ? undefined : await service.authenticate(token);
      if (identity) {
        if (!['/auth/logout', '/auth/csrf'].includes(path ?? '')) requireWebAccess(identity);
        if (!['GET', 'HEAD'].includes(request.method)) {
          requireCsrf(request.headers['x-csrf-token'], config.cursorKey, identity.sessionId);
        }
        request.auth = Object.freeze({ userId: identity.userId, sessionId: identity.sessionId });
      }
      else if (path !== '/auth/logout') throw new HttpError(401, 'Authentication required', 'AUTH_REQUIRED');
    })().then(() => next(), (error: unknown) => { response.setHeader('Connection', 'close'); next(error); });
  };
}
