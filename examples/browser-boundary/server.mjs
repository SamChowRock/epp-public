// Local experiment only; never mount this page or proxy in the production API.
import { createServer, request } from 'node:http';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('index.html', import.meta.url));
const script = await readFile(new URL('client.js', import.meta.url));
const servers = [];
function stop() { for (const server of servers) { server.close(); server.closeAllConnections(); } }
for (const port of [3350, 3351]) {
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && ['/', '/client.js'].includes(req.url)) {
      res.setHeader('Content-Type', req.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src http://127.0.0.1:3350; base-uri 'none'; frame-ancestors 'none'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(req.url === '/' ? html : script); return;
    }
    if (port !== 3350 || !/^\/(?:auth|captures|revisions|candidates|learning-records|star-map)(?:\/|\?|$)/.test(req.url)) {
      res.writeHead(404).end(); return;
    }
    const upstream = request({ hostname: '127.0.0.1', port: 3352, method: req.method, path: req.url,
      headers: { ...req.headers, host: '127.0.0.1:3352', 'x-forwarded-for': req.socket.remoteAddress,
        'x-forwarded-host': '127.0.0.1:3350', 'x-forwarded-proto': 'http' },
    }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
    upstream.setTimeout(10000, () => upstream.destroy());
    upstream.on('error', () => { if (res.headersSent) res.destroy(); else res.writeHead(502).end('API unavailable'); });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    req.pipe(upstream);
  });
  servers.push(server);
  server.on('error', error => { console.error('LAB_START_FAILED', error.code); process.exitCode = 1; stop(); });
  server.listen(port, '127.0.0.1', () => console.log('Browser lab: http://127.0.0.1:' + port));
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
