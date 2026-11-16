// Development only. Fixed loopback upstream; no arbitrary URL forwarding.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validPath } from './pending.mjs';
export function createPracticeServer({ targetPort, sessionMode = false, csrfMode = false, dropSuccessOnce = false }) {
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) throw Error('Invalid target port');
  const dropped = new Set();
  const assets = new Map([['/', ['index.html', 'text/html']], ['/page.mjs', ['page.mjs', 'text/javascript']], ['/pending.mjs', ['pending.mjs', 'text/javascript']]]);
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET' && assets.has(request.url)) {
      const [file, type] = assets.get(request.url);
      response.setHeader('Content-Type', `${type}; charset=utf-8`);
      try { response.end(await readFile(new URL(file, import.meta.url))); }
      catch { response.writeHead(500); response.end(); }
      return;
    }
    if (request.method === 'GET' && request.url === '/practice-config') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ sessionMode, csrfMode, dropSuccessOnce })); return;
    }
    const path = request.url ?? '';
    const permitted = (request.method === 'POST' && (validPath(path) || path === '/auth/logout' || (sessionMode && path === '/auth/login')))
      || (request.method === 'GET' && (/^\/captures(?:\/[0-9a-f-]{36}(?:\/revisions)?)?(?:\?[^#]*)?$/.test(path)
        || ['/lab/identity', '/auth/me', '/auth/csrf'].includes(path)));
    if (!permitted) { response.writeHead(404); response.end(); return; }
    // Browser ambient credentials and Origin remain exactly those of the page.
    // No header is translated into an authenticated user identity.
    const headers = {};
    for (const name of ['content-type', 'content-length', 'cookie', 'origin', 'idempotency-key', 'x-csrf-token', 'x-expected-session', 'x-epp-request']) {
      if (request.headers[name] !== undefined) headers[name] = request.headers[name];
    }
    const upstream = http.request({ host: '127.0.0.1', port: targetPort, method: request.method, path, headers, timeout: 15000 }, result => {
      const operation = headers['idempotency-key'];
      const drop = dropSuccessOnce && request.method === 'POST' && validPath(path)
        && typeof operation === 'string' && result.statusCode === 201 && !dropped.has(operation);
      if (drop) {
        dropped.add(operation);
        result.resume();
        result.on('end', () => {
          console.log(`Consumed upstream 201; truncating first success for ${operation}`);
          // A close before any bytes can be transparently retried by a browser.
          // Start a response, then deliberately violate its declared body length.
          response.writeHead(201, { 'Content-Type': 'application/json', 'Content-Length': '1024',
            ...(result.headers.location ? { Location: result.headers.location } : {}) });
          response.write('{"id":', () => response.destroy());
        });
      } else {
        for (const name of ['content-type', 'location', 'set-cookie']) {
          if (result.headers[name] !== undefined) response.setHeader(name, result.headers[name]);
        }
        response.writeHead(result.statusCode ?? 502); result.pipe(response);
      }
      result.on('error', () => response.destroy());
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => {
      if (response.destroyed) return;
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.on('aborted', () => upstream.destroy());
    request.on('error', () => upstream.destroy());
    request.pipe(upstream);
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') throw Error('This runner is development-only');
  const port = Number(process.env.PORT ?? 3030);
  const targetPort = Number(process.env.TARGET_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === targetPort) throw Error('Invalid PORT or duplicate ports');
  const server = createPracticeServer({ targetPort, sessionMode: process.env.SESSION_MODE === 'true',
    csrfMode: process.env.CSRF_MODE === 'true', dropSuccessOnce: process.env.DROP_SUCCESS_ONCE === 'true' });
  server.listen(port, '127.0.0.1', () => console.log(`Practice page: http://127.0.0.1:${port} (upstream ${targetPort})`));
}
