import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { burnCpu, burnInSlices } from './event-loop-work.js';

async function handle(request, response) {
  const { pathname } = new URL(request.url, 'http://127.0.0.1');
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end();
    return;
  }
  if (!['/quick', '/wait', '/block', '/slice'].includes(pathname)) {
    response.writeHead(404);
    response.end();
    return;
  }

  const start = performance.now();
  console.log(`begin ${pathname}`);
  const probe = setTimeout(() => {
    console.log(`${pathname}: 100 ms timer ran at ${Math.round(performance.now() - start)} ms`);
  }, 100);
  try {
    if (pathname === '/wait') await delay(600);
    if (pathname === '/block') burnCpu(600);
    if (pathname === '/slice') await burnInSlices();
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ pathname, elapsedMs: Math.round(performance.now() - start) }));
  } finally {
    // Keep this observation timer: it reports even if /block finishes first.
    // It is finite, and will not start business work or write a response.
    if (pathname === '/quick') clearTimeout(probe);
  }
}

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error.message);
    if (response.destroyed || response.writableEnded) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(500);
    response.end('Experiment failed');
  });
});
server.on('error', (error) => {
  console.error(`Experiment server failed: ${error.code ?? 'UNKNOWN'}`);
  process.exitCode = 1;
});
server.listen(3002, '127.0.0.1', () => {
  console.log('Event loop experiment: http://127.0.0.1:3002');
});
