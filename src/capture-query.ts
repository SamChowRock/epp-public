import type { CaptureListOptions } from './capture.js';
import { ListQuerySchema } from './capture-contract.js';
import { parseInput } from './input-validation.js';

export function parseListQuery(q: unknown, limit: unknown): CaptureListOptions {
  const parsed = parseInput(ListQuerySchema, { q, limit });
  return {
    text: parsed.q,
    limit: parsed.limit === undefined ? undefined : Number(parsed.limit),
  };
}
