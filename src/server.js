import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = 3000;
const server = createServer((request, response) => {
  console.log(JSON.stringify({ event: 'http.request', method: request.method }));
  const isList = request.method === 'GET' && request.url === '/captures';
  response.writeHead(isList ? 200 : 404, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(isList ? { items: [] } : { error: 'Not found' }));
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Cannot listen on ${host}:${port}: address already in use`);
  } else {
    console.error(`Server failed: ${error.code ?? 'UNKNOWN'}`);
  }
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`EPP listening on http://${host}:${port}`);
});
