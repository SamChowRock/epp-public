import type { CaptureListOptions } from './captures.service.js';
import { HttpError } from './http.js';

export function parseListQuery(q: unknown, limit: unknown): CaptureListOptions {
  if (q !== undefined && typeof q !== 'string') {
    throw new HttpError(400, 'q must occur once and be a string');
  }
  if (limit !== undefined &&
      (typeof limit !== 'string' || !/^[1-9]\d{0,2}$/.test(limit))) {
    throw new HttpError(400, 'limit must be a decimal integer from 1 to 100');
  }
  return {
    text: q,
    limit: limit === undefined ? undefined : Number(limit),
  };
}
