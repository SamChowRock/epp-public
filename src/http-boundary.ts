import type { Request, Response, NextFunction } from 'express';
import { HttpError, respond, sendJson } from './http.js';

// Preserve the existing path/method contract before Express route matching.
export function httpBoundary(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  console.log(JSON.stringify({ event: 'http.request', method: request.method }));
  void respond(response, () => {
    let url: URL;
    try {
      url = new URL(request.url, 'http://127.0.0.1');
    } catch {
      throw new HttpError(400, 'Request URL is invalid');
    }
    const detail = /^\/captures\/([^/]+)$/.exec(url.pathname);
    const allowed = url.pathname === '/captures' ? ['GET', 'POST']
      : detail ? ['GET'] : undefined;
    if (!allowed) throw new HttpError(404, 'Route not found');
    if (!allowed.includes(request.method)) {
      sendJson(response, 405, { error: 'Method not allowed' }, {
        Allow: allowed.join(', '),
      });
      return;
    }
    // IDs generated here are literal UUIDs. Preserve the former raw-path lookup.
    if (detail?.[1]?.includes('%')) {
      throw new HttpError(404, 'Capture not found');
    }
    request.url = url.pathname + url.search;
    next();
  });
}
