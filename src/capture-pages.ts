import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from './generated/prisma/client.js';
import { CaptureResponseSchema, ListQuerySchema } from './capture-contract.js';
import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import { HttpError } from './http.js';

export const CapturePageQuerySchema = z.object({
  q: ListQuerySchema.shape.q,
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/).optional(),
  cursor: z.string().min(1).max(2048).optional(),
}).strict();
export type CapturePageQuery = z.infer<typeof CapturePageQuerySchema>;
export const CapturePageSchema = z.object({
  items: z.array(CaptureResponseSchema).max(100), limit: z.number().int().min(1).max(100),
  hasMore: z.boolean(), nextCursor: z.string().nullable(),
});
const CursorSchema = z.object({
  v: z.literal(1), scope: z.string(), expires: z.number().int().positive(),
  at: z.iso.datetime({ precision: 3 }), id: z.uuid().regex(/^[0-9a-f-]+$/),
}).strict();
function signature(body: string, key: string) {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(body).digest();
}
type Row = { id: string; originalText: string; chineseIntent: string | null; createdAt: Date };

export class CapturePages {
  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState,
    private readonly cursorKey: string, private readonly userId: string) {}

  list(query: CapturePageQuery) {
    const limit = Number(query.limit ?? '20');
    const scope = JSON.stringify(['capture-list/v1', this.userId, 'createdAt-asc,id-asc', limit, query.q ?? null]);
    let expires = Date.now() + 30 * 60 * 1000;
    let boundary: z.infer<typeof CursorSchema> | undefined;
    if (query.cursor !== undefined) {
      try {
        if (query.cursor.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(query.cursor)) throw new Error();
        const [body, mac] = query.cursor.split('.') as [string, string];
        const decoded = Buffer.from(body, 'base64url');
        const actual = Buffer.from(mac, 'base64url');
        if (decoded.toString('base64url') !== body || actual.toString('base64url') !== mac || actual.length !== 32 ||
          !timingSafeEqual(actual, signature(body, this.cursorKey))) throw new Error();
        boundary = CursorSchema.parse(JSON.parse(decoded.toString('utf8')));
        if (boundary.scope !== scope || boundary.expires <= Date.now() || boundary.at.startsWith('0000-') ||
          new Date(boundary.at).toISOString() !== boundary.at) throw new Error();
        expires = boundary.expires;
      } catch { throw new HttpError(400, 'Invalid or expired cursor; restart from the first page', 'INVALID_CURSOR'); }
    }
    return this.state.track(() => this.database.run('listCapturePage', async () => {
      // Read the latest snapshot before filtering; the immutable parent supplies the boundary.
      const rows = await this.database.client.$queryRaw<Row[]>(Prisma.sql`
        SELECT c.id, r.original_text AS "originalText", r.chinese_intent AS "chineseIntent", c.created_at AS "createdAt"
        FROM public.captures c
        JOIN LATERAL (SELECT original_text, chinese_intent FROM public.capture_revisions
          WHERE capture_id = c.id ORDER BY revision_no DESC LIMIT 1) r ON true
        WHERE c.user_id = ${this.userId}::uuid
          ${query.q === undefined ? Prisma.empty : Prisma.sql`AND strpos(r.original_text COLLATE "C", ${query.q}) > 0`}
          ${boundary === undefined ? Prisma.empty : Prisma.sql`AND (c.created_at, c.id) > (${new Date(boundary.at)}::timestamptz, ${boundary.id}::uuid)`}
        ORDER BY c.created_at ASC, c.id ASC LIMIT ${limit + 1}
      `);
      const hasMore = rows.length > limit;
      let nextCursor: string | null = null;
      if (hasMore) {
        const last = rows[limit - 1]!;
        const body = Buffer.from(JSON.stringify({ v: 1, scope, expires, at: last.createdAt.toISOString(), id: last.id })).toString('base64url');
        nextCursor = body + '.' + signature(body, this.cursorKey).toString('base64url');
      }
      return { items: rows.slice(0, limit).map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), limit, hasMore, nextCursor };
    }));
  }
}
