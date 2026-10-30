import { HttpException } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http';
import { errorMessage } from './errors.js';
import { InvalidCaptureError, CaptureNotFoundError } from './captures.service.js';

const maxBodyBytes = 16 * 1024;

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(
    statusCode: number,
    message: string,
    readonly code = `HTTP_${statusCode}`,
    readonly issues?: Array<{ path: Array<string | number>; message: string }>,
  ) {
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
        reject(new HttpError(413, 'Request body is too large', 'BODY_TOO_LARGE'));
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
        reject(new HttpError(400, 'Request body must be valid UTF-8 JSON', 'INVALID_JSON'));
      }
    });

    request.on('error', () => {
      reject(new HttpError(400, 'Request body could not be read', 'BODY_READ_FAILED'));
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
    sendJson(response, failure.statusCode, failure.body, {
      'Content-Type': 'application/problem+json; charset=utf-8',
      Connection: 'close',
    });
  }
}

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  issues?: Array<{ path: Array<string | number>; message: string }>;
};

export function httpFailure(error: unknown): {
  statusCode: number;
  body: Problem;
} {
  const statusCode = error instanceof HttpError ? error.statusCode
    : error instanceof InvalidCaptureError ? 400
    : error instanceof CaptureNotFoundError ? 404 : 500;
  if (statusCode === 500) console.error('Unhandled request failure:', error instanceof Error ? error.name : 'UnknownError');
  const code = statusCode === 500 ? 'INTERNAL_ERROR'
    : error instanceof InvalidCaptureError ? 'INVALID_CAPTURE'
    : error instanceof CaptureNotFoundError ? 'CAPTURE_NOT_FOUND'
    : error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
  return {
    statusCode,
    body: {
      type: 'about:blank',
      title: STATUS_CODES[statusCode] ?? 'Error',
      status: statusCode,
      detail: statusCode === 500 ? 'Internal server error' : errorMessage(error),
      code,
      ...(error instanceof HttpError && error.issues ? { issues: error.issues } : {}),
    },
  };
}

export async function httpResult<T>(
  action: () => T | Promise<T>,
  response: ServerResponse,
): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    const failure = httpFailure(error);
    response.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    throw new HttpException(failure.body, failure.statusCode);
  }
}
