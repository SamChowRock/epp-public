import { HttpException } from '@nestjs/common';
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http';
import { errorMessage } from './errors.js';
import { InvalidCaptureError, CaptureNotFoundError } from './captures.service.js';

const maxBodyBytes = 16 * 1024;

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  data: unknown,
  headers: OutgoingHttpHeaders = {},
): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(data));
}

export function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let tooLarge = false;

    request.on('data', (chunk: Buffer) => {
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
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
          .decode(Buffer.concat(chunks));
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'Request body must be valid UTF-8 JSON'));
      }
    });

    request.on('error', () => {
      reject(new HttpError(400, 'Request body could not be read'));
    });
  });
}

export async function respond(
  response: ServerResponse,
  action: () => void | Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    if (response.destroyed || response.writableEnded) return;
    const failure = httpFailure(error);
    sendJson(response, failure.statusCode, failure.body, { Connection: 'close' });
  }
}

function httpFailure(error: unknown): {
  statusCode: number;
  body: { error: string };
} {
  const statusCode = error instanceof HttpError ? error.statusCode
    : error instanceof InvalidCaptureError ? 400
    : error instanceof CaptureNotFoundError ? 404 : 500;
  if (statusCode === 500) console.error(error);
  return {
    statusCode,
    body: { error: statusCode === 500 ? 'Internal server error' : errorMessage(error) },
  };
}

export async function httpResult<T>(action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    const failure = httpFailure(error);
    throw new HttpException(failure.body, failure.statusCode);
  }
}
