import type { Request, Response, NextFunction } from 'express';
import { HttpError, readJson } from './http.js';

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
  const mediaType = request.headers['content-type']
    ?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    response.setHeader('Connection', 'close');
    next(new HttpError(415, 'Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE'));
    return;
  }
  void readJson(request).then(body => {
    request.body = body;
    next();
  }).catch((error: unknown) => {
    response.setHeader('Connection', 'close');
    next(error);
  });
}
