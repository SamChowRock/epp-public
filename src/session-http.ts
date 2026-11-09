import { MINI_PUBLIC_PATHS } from './mini-contract.js';
import { RECOVERY_PATHS } from './recovery-contract.js';
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

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  if (header.length > 4096) throw new HttpError(400, 'Cookie header is too large', 'COOKIE_INVALID');
  const matches = header.split(';').map(part => part.trim()).filter(part => part.slice(0, part.indexOf('=')) === name);
  if (matches.length > 1) throw new HttpError(400, 'Duplicate session cookie', 'COOKIE_INVALID');
  return matches[0]?.slice(name.length + 1);
}

export const privateResponses: RequestHandler = (_request, response, next) => {
  response.setHeader('Cache-Control', 'private, no-store');
  response.vary('Cookie');
  response.vary('Authorization');
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
      if (['/auth/wechat-web', '/auth/oidc', '/auth/wechat-web/start', '/auth/oidc/start', '/auth/wechat-web/callback', '/auth/oidc/callback'].includes(path ?? '') || path === '/auth/login' || RECOVERY_PATHS.includes(path ?? '') || MINI_PUBLIC_PATHS.includes(path ?? '')) return;
      const cookie = readCookie(request.headers.cookie, sessionCookieName(config));
      const authorization = request.headers.authorization;
      if (cookie !== undefined && authorization !== undefined) throw new HttpError(400, 'Use one session transport', 'AUTH_AMBIGUOUS');
      const mini = authorization !== undefined;
      if (mini && !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) throw new HttpError(401, 'Bearer token is invalid', 'AUTH_REQUIRED');
      const token = mini ? authorization.slice(7) : cookie;
      const identity = token === undefined ? undefined : await service.authenticate(token, mini ? 'mini' : 'web');
      if (identity) {
        if (mini && ['/auth/csrf', '/auth/password'].includes(path ?? '')) throw new HttpError(403, 'This operation requires a Web session', 'SESSION_CHANNEL_DENIED');
        if (mini) {
          if (path !== '/auth/logout' && (identity.status !== 'active' || !identity.miniEnabled)) {
            throw new HttpError(403, 'Account is not permitted to use this service', identity.status !== 'active' ? 'ACCOUNT_DISABLED' : 'MINI_ACCESS_DENIED');
          }
        } else if (!['/auth/logout', '/auth/csrf'].includes(path ?? '')) requireWebAccess(identity);
        if (!mini && !['GET', 'HEAD'].includes(request.method)) {
          requireCsrf(request.headers['x-csrf-token'], config.cursorKey, identity.sessionId);
        }
        request.auth = Object.freeze({ userId: identity.userId, sessionId: identity.sessionId });
      }
      else if (path !== '/auth/logout') throw new HttpError(401, 'Authentication required', 'AUTH_REQUIRED');
    })().then(() => next(), (error: unknown) => { response.setHeader('Connection', 'close'); next(error); });
  };
}
