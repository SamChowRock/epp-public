// Development-only, fixed server identity. This is not an authentication service.
import { createServer } from 'node:http';
import { createApp } from '../../dist/src/app.js';
import { DatabaseService } from '../../dist/src/database.service.js';
import { ApplicationState } from '../../dist/src/application-state.js';
import { CaptureCommands } from '../../dist/src/capture-commands.js';
import { CaptureResponseSchema, RevisionResponseSchema, RevisionQuerySchema } from '../../dist/src/capture-contract.js';
import { parseInput } from '../../dist/src/input-validation.js';
import { CaptureNotFoundError } from '../../dist/src/captures.service.js';
import { readJson, httpFailure, sendJson, HttpError } from '../../dist/src/http.js';

if (!['development', 'test'].includes(process.env.NODE_ENV)) throw new Error('Development fixture only');
const userId = process.env.LAB_USER_ID;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId ?? '')) {
  throw new Error('LAB_USER_ID must name an existing synthetic user');
}
const port = Number(process.env.API_PORT ?? 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid API_PORT');
const app = await createApp();
await app.init();
const database = app.get(DatabaseService);
if (!await database.client.user.findUnique({ where: { id: userId }, select: { id: true } })) {
  await app.close(); throw new Error('Synthetic user does not exist');
}
const state = app.get(ApplicationState);
const commands = new CaptureCommands(database, state, userId);
let closing = false;
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  try {
    if (closing) { sendJson(response, 503, { code: 'SERVICE_DRAINING' }); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    const history = /^\/captures\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/revisions$/.exec(url.pathname);
    // This small fixture explicitly rejects query options except revision pagination.
    if (url.search && !(request.method === 'GET' && history)) {
      throw new HttpError(400, 'This fixture does not accept query parameters on this route', 'INVALID_QUERY');
    }
    if (request.method === 'GET' && history) {
      const query = {};
      for (const [key, value] of url.searchParams) {
        if (Object.hasOwn(query, key)) throw new HttpError(400, 'Repeated query parameter', 'INVALID_QUERY');
        Object.defineProperty(query, key, { value, enumerable: true });
      }
      const parsed = parseInput(RevisionQuerySchema, query);
      const before = parsed.before === undefined ? undefined : Number(parsed.before);
      const limit = parsed.limit === undefined ? 20 : Number(parsed.limit);
      const row = await state.track(() => database.run('fixtureRevisions', () => database.client.capture.findFirst({
        where: { id: history[1], userId }, select: { revisions: {
          where: before === undefined ? {} : { revisionNo: { lt: before } },
          orderBy: { revisionNo: 'desc' }, take: limit + 1,
        } },
      })));
      if (!row) throw new CaptureNotFoundError('Capture not found');
      const items = row.revisions.slice(0, limit).map(r => RevisionResponseSchema.parse({
        ...r, createdAt: r.createdAt.toISOString(),
      }));
      sendJson(response, 200, { items, nextBefore: row.revisions.length > limit ? items.at(-1).revisionNo : null });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/lab/identity') {
      sendJson(response, 200, { userId }); return;
    }
    if (request.method === 'POST') {
      if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
        sendJson(response, 415, { code: 'JSON_REQUIRED' }); return;
      }
      const key = request.headers['idempotency-key'];
      if (key === undefined) { sendJson(response, 400, { code: 'FIXTURE_REQUIRES_KEY' }); return; }
      const input = await readJson(request);
      if (url.pathname === '/captures') {
        const result = await commands.create(key, input);
        sendJson(response, 201, result, { Location: `/captures/${result.id}` }); return;
      }
      const match = history;
      if (match) {
        sendJson(response, 201, await commands.appendRevision(match[1], key, input)); return;
      }
    }
    if (request.method === 'GET' && (url.pathname === '/captures' || /^\/captures\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(url.pathname))) {
      const id = url.pathname.split('/')[2];
      const rows = await state.track(() => database.run('fixtureCaptures', () => database.client.capture.findMany({
        where: { userId, ...(id ? { id } : {}) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, createdAt: true, revisions: { orderBy: { revisionNo: 'desc' }, take: 1,
          select: { originalText: true, chineseIntent: true } } },
      })));
      const items = rows.map(row => CaptureResponseSchema.parse({ id: row.id, createdAt: row.createdAt.toISOString(), ...row.revisions[0] }));
      sendJson(response, id && !items[0] ? 404 : 200, id ? items[0] ?? { code: 'CAPTURE_NOT_FOUND' } : { items }); return;
    }
    sendJson(response, 404, { code: 'NOT_FOUND' });
  } catch (error) {
    const failure = httpFailure(error);
    if (!response.destroyed && !response.headersSent) sendJson(response, failure.statusCode, failure.body);
  }
});
server.listen(port, '127.0.0.1', () => console.log('Fixed-identity fixture ready on loopback'));
async function close() {
  if (closing) return;
  closing = true;
  await new Promise(resolve => server.close(resolve));
  await state.whenIdle();
  await app.close();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void close().catch(() => { process.exitCode = 1; }));
