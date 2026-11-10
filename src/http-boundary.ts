import { RECOVERY_PATHS } from './recovery-contract.js';
import type { Request, Response, NextFunction } from 'express';
import { HttpError } from './http.js';

// Preserve the existing path/method contract before Express route matching.
export function httpBoundary(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  try {
    let url: URL;
    try {
      url = new URL(request.url, 'http://127.0.0.1');
    } catch {
      throw new HttpError(400, 'Request URL is invalid', 'INVALID_URL');
    }
    // The simple parser silently stops after 1000 entries; reject before parsing.
    const queryParts = url.search === '' ? 0 : url.search.slice(1).split('&').length;
    if (queryParts > 1000) {
      throw new HttpError(400, 'Query string must contain at most 1000 parameters', 'QUERY_TOO_LARGE');
    }
    const detail = /^\/captures\/([^/]+)$/.exec(url.pathname);
    const revisions = /^\/captures\/([^/]+)\/revisions$/.exec(url.pathname);
    const candidates = /^\/revisions\/([^/]+)\/candidates$/.exec(url.pathname);
    const discard = /^\/candidates\/([^/]+)\/(?:discard|accept)$/.exec(url.pathname);
    const learningDetail = /^\/learning-records\/([^/]+)$/.exec(url.pathname);
    const sessionDetail = /^\/auth\/sessions\/([^/]+)$/.exec(url.pathname);
    const notificationRead = /^\/notifications\/([^/]+)\/read$/.exec(url.pathname);
    const notificationDetail = /^\/notifications\/([^/]+)$/.exec(url.pathname);
    if ((notificationRead?.[1] ?? notificationDetail?.[1])?.includes('%')) {
      throw new HttpError(404, 'Route not found', 'ROUTE_NOT_FOUND');
    }
    const allowed = ['/auth/login', '/auth/logout', '/auth/password', ...RECOVERY_PATHS].includes(url.pathname) ? ['POST']
      : ['/auth/me', '/auth/sessions', '/auth/csrf'].includes(url.pathname) ? ['GET'] : sessionDetail ? ['DELETE']
      : url.pathname === '/notifications' ? ['GET'] : notificationRead ? ['POST'] : notificationDetail ? ['DELETE']
      : url.pathname === '/captures' ? ['GET', 'POST']
      : detail ? ['GET', 'PATCH'] : revisions || candidates ? ['GET', 'POST'] : discard ? ['POST']
      : learningDetail || ['/learning-records', '/star-map'].includes(url.pathname) ? ['GET'] : undefined;
    if (!allowed) throw new HttpError(404, 'Route not found', 'ROUTE_NOT_FOUND');
    if (!allowed.includes(request.method)) {
      response.setHeader('Allow', allowed.join(', '));
      throw new HttpError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }
    // IDs generated here are literal UUIDs. Preserve the former raw-path lookup.
    if ((candidates?.[1] ?? discard?.[1])?.includes('%')) {
      throw new HttpError(404, 'Candidate or revision not found', 'CANDIDATE_NOT_FOUND');
    }
    if ((detail?.[1] ?? revisions?.[1])?.includes('%')) {
      throw new HttpError(404, 'Capture not found', 'CAPTURE_NOT_FOUND');
    }
    if (learningDetail?.[1]?.includes('%')) {
      throw new HttpError(404, 'Learning record not found', 'LEARNING_RECORD_NOT_FOUND');
    }
    if (sessionDetail?.[1]?.includes('%')) {
      throw new HttpError(404, 'Session not found', 'SESSION_NOT_FOUND');
    }
    request.url = url.pathname + url.search;
    next();
  } catch (error: unknown) {
    response.setHeader('Connection', 'close');
    next(error);
  }
}
