import { Prisma } from './generated/prisma/client.js';
import type { Capture, CaptureListOptions } from './capture.js';
import type { CaptureStore } from './capture-store.js';
import { DatabaseService } from './database.service.js';
import { DEVELOPMENT_USER_ID } from './database-config.js';

const selection = { id: true, originalText: true, createdAt: true } as const;
type Row = Prisma.CaptureGetPayload<{ select: typeof selection }>;
const project = (row: Row): Capture => ({
  id: row.id, originalText: row.originalText, createdAt: row.createdAt.toISOString(),
});

export class PrismaCaptureStore implements CaptureStore {
  constructor(private readonly database: DatabaseService) {}

  async insert(capture: Capture): Promise<void> {
    await this.database.run('insert', () => this.database.client.capture.create({
      data: { id: capture.id, userId: DEVELOPMENT_USER_ID,
        originalText: capture.originalText, createdAt: new Date(capture.createdAt) },
      select: { id: true },
    }));
  }

  async list({ text, limit }: CaptureListOptions): Promise<Capture[]> {
    const rows = await this.database.run('list', () => this.database.client.$queryRaw<Row[]>(Prisma.sql`
      SELECT c.id, c.original_text AS "originalText", c.created_at AS "createdAt"
      FROM public.captures AS c
      WHERE c.user_id = ${DEVELOPMENT_USER_ID}::uuid
        ${text === undefined ? Prisma.empty : Prisma.sql`AND strpos(c.original_text COLLATE "C", ${text}) > 0`}
      ORDER BY c.created_at ASC, c.id ASC
      ${limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
    `));
    return rows.map(project);
  }

  async find(id: string): Promise<Capture | undefined> {
    // Preserve literal path semantics: invalid or noncanonical IDs are misses, not cast errors.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return undefined;
    const row = await this.database.run('find', () => this.database.client.capture.findFirst({
      where: { id, userId: DEVELOPMENT_USER_ID }, select: selection,
    }));
    return row === null ? undefined : project(row);
  }
}
