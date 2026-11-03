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
    const allowed = url.pathname === '/captures' ? ['GET', 'POST']
      : detail ? ['GET', 'PATCH'] : revisions ? ['GET', 'POST'] : undefined;
    if (!allowed) throw new HttpError(404, 'Route not found', 'ROUTE_NOT_FOUND');
    if (!allowed.includes(request.method)) {
      response.setHeader('Allow', allowed.join(', '));
      throw new HttpError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }
    // IDs generated here are literal UUIDs. Preserve the former raw-path lookup.
    if ((detail?.[1] ?? revisions?.[1])?.includes('%')) {
      throw new HttpError(404, 'Capture not found', 'CAPTURE_NOT_FOUND');
    }
    request.url = url.pathname + url.search;
    next();
  } catch (error: unknown) {
    response.setHeader('Connection', 'close');
    next(error);
  }
}
