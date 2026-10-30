import { z } from 'zod';
import { HttpError } from './http.js';

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map(issue => ({
      path: issue.path.map(part => typeof part === 'number' ? part : String(part)),
      message: issue.message,
    }));
    throw new HttpError(400, 'Request validation failed', 'VALIDATION_ERROR', issues);
  }
  return result.data;
}
