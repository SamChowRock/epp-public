import { MINI_PUBLIC_PATHS } from './mini-contract.js';
import { RECOVERY_PATHS } from './recovery-contract.js';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';
import { HttpError } from './http.js';

export function requestObservation(logger: AppLogger, state: ApplicationState, knownPaths: readonly string[] = []): RequestHandler {
  return (request, response, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    const method = ['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)
      ? request.method : 'OTHER';
    const path = request.url.split('?')[0] ?? '';
    // Route labels are constants, never raw paths or resource IDs.
    const route = ['/auth/wechat-web', '/auth/oidc','/auth/wechat-web/start', '/auth/oidc/start','/auth/wechat-web/callback', '/auth/oidc/callback','/auth/login', '/auth/logout', '/auth/password', '/auth/csrf', '/auth/me', '/auth/sessions', ...RECOVERY_PATHS, ...MINI_PUBLIC_PATHS].includes(path) ? path
      : /^\/auth\/sessions\/[^/]+$/.test(path) ? '/auth/sessions/:id'
      : knownPaths.includes(path) ? path : path === '/captures' ? '/captures'
      : ['/learning-records', '/star-map'].includes(path) ? path
      : /^\/learning-records\/[^/]+$/.test(path) ? '/learning-records/:id'
      : /^\/revisions\/[^/]+\/candidates$/.test(path) ? '/revisions/:revisionId/candidates'
      : /^\/candidates\/[^/]+\/accept$/.test(path) ? '/candidates/:id/accept'
      : /^\/candidates\/[^/]+\/discard$/.test(path) ? '/candidates/:id/discard'
      : /^\/captures\/[^/]+\/revisions$/.test(path) ? '/captures/:id/revisions'
      : /^\/captures\/[^/]+$/.test(path) ? '/captures/:id'
      : path === '/openapi.json' || path === '/docs' || path.startsWith('/docs/') ? 'docs' : 'unmatched';
    response.setHeader('X-Request-Id', requestId);
    logger.withRequest(requestId, () => {
      logger.write('info', 'http.started', { method, route });
      let reported = false;
      const complete = (aborted: boolean) => {
        if (reported) return;
        reported = true;
        logger.withRequest(requestId, () => logger.write(aborted ? 'warn' : 'info',
          aborted ? 'http.aborted' : 'http.completed', {
            method, route, status: aborted ? undefined : response.statusCode,
            durationMs: Math.round(performance.now() - started),
          }));
      };
      response.once('finish', () => complete(false));
      response.once('close', () => complete(!response.writableFinished));
      if (state.draining) {
        response.setHeader('Connection', 'close');
        next(new HttpError(503, 'Service is shutting down', 'SERVICE_DRAINING'));
      } else next();
    });
  };
}
