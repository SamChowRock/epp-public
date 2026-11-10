import { createServer, request } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';

const host = '127.0.0.1';
const port = Number(process.env.LAB_PORT ?? 3100);
const apiPort = Number(process.env.API_PORT ?? 3000);
const assets = new Map(await Promise.all([
  ['/', 'index.html', 'text/html'], ['/app.js', 'app.js', 'text/javascript'],
  ['/style.css', 'style.css', 'text/css'],
].map(async ([path, file, mime]) => [path, [mime, await readFile(new URL(file, import.meta.url))]])));
const routes = new Set(['POST /auth/login', 'GET /auth/me', 'GET /notifications?limit=20', 'GET /notifications/events']);
let failNextPage = false;
if (process.argv.includes('--fault-console')) {
  console.log('输入 503 并回车，可让下一次首页查询失败一次。');
  const commands = createInterface({ input: process.stdin });
  commands.on('line', line => {
    if (line.trim() === '503') {
      failNextPage = true;
      console.log('503 已就绪，等待下一次首页查询。');
    }
  });
}
createServer((req, res) => {
  if (req.headers.host !== host + ':' + port) { res.writeHead(403).end(); return; }
  const asset = assets.get(req.url);
  if (asset && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': asset[0] + '; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'" });
    res.end(asset[1]);
    return;
  }
  if (!routes.has(req.method + ' ' + req.url)) { res.writeHead(404).end(); return; }
  if (failNextPage && req.method === 'GET' && req.url === '/notifications?limit=20') {
    failNextPage = false;
    res.writeHead(503, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  const upstream = request({ hostname: host, port: apiPort, method: req.method, path: req.url,
    headers: { ...req.headers, host: host + ':' + apiPort, connection: 'close' } }, incoming => {
    res.writeHead(incoming.statusCode, incoming.headers);
    res.flushHeaders();
    incoming.on('error', () => res.destroy());
    incoming.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent && !res.destroyed) res.writeHead(502).end();
    else res.destroy();
  });
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}).listen(port, host, () => console.log('http://' + host + ':' + port));
