import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { LearningQuery } from './learning-contract.js';
import { HttpError } from './http.js';

const CursorSchema = z.object({
  v: z.literal(1), scope: z.string(), expires: z.number().int().positive(),
  at: z.iso.datetime({ precision: 3 }), id: z.uuid().regex(/^[0-9a-f-]+$/),
}).strict();
function signature(body: string, key: string) {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(body).digest();
}
export function pageRequest(query: LearningQuery, resource: string, userId: string, key: string) {
  const limit = Number(query.limit ?? '20');
  const scope = JSON.stringify([resource, userId, 'createdAt-desc,id-desc', limit,
    query.expressionId ?? null, query.from ?? null, query.to ?? null]);
  let expires = Date.now() + 30 * 60 * 1000;
  let boundary: { at: string; id: string } | undefined;
  if (query.cursor !== undefined) {
    try {
      if (query.cursor.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(query.cursor)) throw new Error();
      const [body, mac] = query.cursor.split('.') as [string, string];
      const actual = Buffer.from(mac, 'base64url');
      if (actual.toString('base64url') !== mac || actual.length !== 32 || !timingSafeEqual(actual, signature(body, key))) throw new Error();
      const parsed = CursorSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
      if (parsed.scope !== scope || parsed.expires <= Date.now() || new Date(parsed.at).toISOString() !== parsed.at) throw new Error();
      boundary = parsed; expires = parsed.expires;
    } catch { throw new HttpError(400, 'Invalid or expired cursor; restart from the first page', 'INVALID_CURSOR'); }
  }
  const where = {
    ...(query.from || query.to ? { createdAt: {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lt: new Date(query.to) } : {}),
    } } : {}),
    ...(boundary ? { OR: [
      { createdAt: { lt: new Date(boundary.at) } },
      { createdAt: new Date(boundary.at), id: { lt: boundary.id } },
    ] } : {}),
  };
  return { limit, offset: Number(query.offset ?? '0'), mode: query.mode, scope, expires, where };
}
export function pageResult(page: ReturnType<typeof pageRequest>, rows: { id: string; createdAt: Date }[], key: string) {
  const more = rows.length > page.limit;
  if (page.mode === 'offset') {
    const next = page.offset + page.limit;
    return { nextOffset: more && next <= 10000 ? next : null };
  }
  if (page.mode !== 'cursor') return {};
  if (!more) return { nextCursor: null };
  const last = rows[page.limit - 1]!;
  const body = Buffer.from(JSON.stringify({ v: 1, scope: page.scope, expires: page.expires,
    at: last.createdAt.toISOString(), id: last.id })).toString('base64url');
  return { nextCursor: body + '.' + signature(body, key).toString('base64url') };
}
