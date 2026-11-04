// Local fault experiment only; not mounted in the EPP application.
import http from 'node:http';
function port(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!/^[1-9][0-9]{0,4}$/.test(value) || Number(value) > 65535) throw Error(`Invalid ${name}`);
  return Number(value);
}
const targetPort = port('TARGET_PORT', '3000'), listenPort = port('PORT', '3010');
if (targetPort === listenPort) throw Error('Proxy and target ports must differ');
let dropNextSuccess = true;
const server = http.createServer((request, response) => {
  if (request.method !== 'POST' || !/^\/candidates\/[0-9a-f-]{36}\/accept$/.test(request.url ?? '')) {
    response.writeHead(404);response.end();return;
  }
  const upstream = http.request({ host: '127.0.0.1', port: targetPort, path: request.url,
    method: 'POST', headers: { 'Content-Type': request.headers['content-type'] ?? '' }, timeout: 10000 }, result => {
    if (dropNextSuccess && result.statusCode === 201) {
      dropNextSuccess = false;
      result.resume();
      result.on('end', () => {
        console.log('Upstream 201 consumed; dropping the client response.');
        response.destroy();
      });
    } else {
      response.writeHead(result.statusCode ?? 502, { 'Content-Type': result.headers['content-type'] ?? 'application/json' });
      result.pipe(response);
    }
    result.on('error', () => response.destroy());
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (!response.headersSent && !response.destroyed) response.writeHead(502);response.end(); });
  request.on('aborted', () => upstream.destroy());
  request.on('error', () => upstream.destroy());
  request.pipe(upstream);
});
server.on('error', () => { console.error('Local loss proxy failed');process.exitCode = 1; });
server.listen(listenPort, '127.0.0.1', () => console.log(`Local loss proxy: ${listenPort} -> ${targetPort}`));
