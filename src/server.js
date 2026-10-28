import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';

const host = '127.0.0.1';
const captures = new Map();
const maxBodyBytes = 16 * 1024;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, data, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(data));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > maxBodyBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, 'Request body is too large'));
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (tooLarge) return;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'Request body must be valid JSON'));
      }
    });

    request.on('error', () => {
      reject(new HttpError(400, 'Request body could not be read'));
    });
  });
}

async function handleRequest(request, response) {
  let pathname;
  try {
    ({ pathname } = new URL(request.url, 'http://127.0.0.1'));
  } catch {
    throw new HttpError(400, 'Request URL is invalid');
  }

  if (pathname === '/captures') {
    if (request.method === 'GET') {
      sendJson(response, 200, { items: [...captures.values()] });
      return;
    }

    if (request.method === 'POST') {
      const mediaType = request.headers['content-type']
        ?.split(';')[0].trim().toLowerCase();
      if (mediaType !== 'application/json') {
        throw new HttpError(415, 'Content-Type must be application/json');
      }

      const body = await readJson(request);
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Request body must be a JSON object');
      }
      if (typeof body.originalText !== 'string' || !body.originalText.trim()) {
        throw new HttpError(400, 'originalText must be a non-empty string');
      }
      if (body.originalText.length > 2000) {
        throw new HttpError(400, 'originalText must be at most 2000 code units');
      }

      const capture = {
        id: randomUUID(),
        originalText: body.originalText,
        createdAt: new Date().toISOString(),
      };
      captures.set(capture.id, capture);
      sendJson(response, 201, capture, {
        Location: `/captures/${capture.id}`,
      });
      return;
    }

    sendJson(response, 405, { error: 'Method not allowed' }, {
      Allow: 'GET, POST',
    });
    return;
  }

  const detailMatch = /^\/captures\/([^/]+)$/.exec(pathname);
  if (detailMatch) {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
      return;
    }
    const capture = captures.get(detailMatch[1]);
    if (!capture) throw new HttpError(404, 'Capture not found');
    sendJson(response, 200, capture);
    return;
  }

  throw new HttpError(404, 'Route not found');
}

const server = createServer((request, response) => {
  console.log(`${request.method} ${request.url}`);
  handleRequest(request, response).catch((error) => {
    if (response.destroyed || response.writableEnded) return;
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    if (statusCode === 500) console.error(error);
    sendJson(response, statusCode, {
      error: statusCode === 500 ? 'Internal server error' : error.message,
    }, { Connection: 'close' });
  });
});

async function start() {
  const { port } = await loadConfig();
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Cannot listen on ${host}:${port}: address already in use`);
    } else {
      console.error(`Server failed: ${error.code ?? 'UNKNOWN'}`);
    }
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`EPP listening on http://${host}:${port} (pid=${process.pid})`);
  });
}

start().catch((error) => {
  console.error(`Cannot start EPP: ${error.message}`);
  process.exitCode = 1;
});
