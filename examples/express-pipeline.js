import express from 'express';
import { setTimeout as delay } from 'node:timers/promises';

const app = express();

app.use((request, response, next) => {
  console.log('outer before', request.path);
  response.on('finish', () => console.log('finish', response.statusCode));
  next();
  console.log('outer after next');
});

app.use((request, response, next) => {
  if (request.path === '/stop') {
    response.status(403).json({ error: 'Stopped before routing' });
    console.log('code after response still runs');
    return;
  }
  next();
});

app.get('/wait', async (request, response) => {
  console.log('route before await');
  await delay(20);
  console.log('route after await');
  response.json({ ok: true });
});

app.get('/fail', async () => {
  await delay(20);
  throw new Error('Example dependency failed');
});

app.get('/callback-fail', (request, response, next) => {
  setTimeout(() => {
    try {
      throw new Error('Example callback failed');
    } catch (error) {
      next(error);
    }
  }, 20);
});

app.get('/hang', () => {
  console.log('neither responding nor calling next');
});

app.use('/echo', express.json({ limit: '1kb' }));
app.post('/echo', (request, response) => {
  console.log('body available', request.readableEnded);
  response.json({ received: request.body });
});

app.use((request, response) => {
  response.status(404).json({ error: 'Example route not found' });
});

app.use((error, request, response, next) => {
  console.log('error handler', error.message);
  if (response.headersSent) return next(error);
  const status = error.type === 'entity.parse.failed' ? 400
    : error.type === 'entity.too.large' ? 413 : 500;
  response.status(status).json({ error: 'Example request failed' });
});

const server = app.listen(3003, '127.0.0.1', () => {
  console.log('Example listening on http://127.0.0.1:3003');
});
server.on('error', (error) => {
  console.error(error.code);
  process.exitCode = 1;
});
