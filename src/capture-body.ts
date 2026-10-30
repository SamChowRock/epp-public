import type { Request, Response, NextFunction } from 'express';
import { HttpError, readJson, respond } from './http.js';

export function captureBody(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  // httpBoundary has already accepted the path and method.
  if (request.method !== 'POST') {
    next();
    return;
  }
  void respond(response, async () => {
    const mediaType = request.headers['content-type']
      ?.split(';')[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') {
      throw new HttpError(415, 'Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE');
    }
    request.body = await readJson(request);
    next();
  });
}
