import { randomUUID } from 'node:crypto';
import { Prisma } from './generated/prisma/client.js';
import type { Capture, CaptureListOptions } from './capture.js';
import type { CaptureRevision, RevisionContent } from './capture-revision.js';
import { RevisionConflictError } from './capture-revision.js';
import { StorageFailureError } from './database-errors.js';
import type { CaptureStore } from './capture-store.js';
import { DatabaseService } from './database.service.js';

const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
type Row = Omit<Capture, 'createdAt'> & { createdAt: Date };
type RevisionRow = Omit<CaptureRevision, 'createdAt'> & { createdAt: Date };
const project = (row: Row): Capture => ({ ...row, createdAt: row.createdAt.toISOString() });
const projectRevision = (row: RevisionRow): CaptureRevision => ({ ...row, createdAt: row.createdAt.toISOString() });
const revisionColumns = Prisma.sql`r.id, r.capture_id AS "captureId", r.revision_no AS "revisionNo",
  r.original_text AS "originalText", r.chinese_intent AS "chineseIntent",
  r.input_source AS "inputSource", r.chunks, r.created_at AS "createdAt"`;

export class PrismaCaptureStore implements CaptureStore {
  constructor(private readonly database: DatabaseService, private readonly userId: string) {}

  async insert(capture: Capture): Promise<void> {
    // One nested write: parent and first revision commit or roll back together.
    await this.database.run('insert', () => this.database.client.capture.create({
      data: { id: capture.id, userId: this.userId,
        originalText: capture.originalText, chineseIntent: capture.chineseIntent, createdAt: new Date(capture.createdAt),
        revisions: { create: { id: randomUUID(), revisionNo: 1,
          originalText: capture.originalText, chineseIntent: capture.chineseIntent,
          inputSource: 'manual', chunks: Prisma.DbNull, createdAt: new Date(capture.createdAt) } } },
      select: { id: true },
    }));
  }

  async list({ text, limit }: CaptureListOptions): Promise<Capture[]> {
    const rows = await this.database.run('list', () => this.database.client.$queryRaw<Row[]>(Prisma.sql`
      SELECT c.id, r.original_text AS "originalText", r.chinese_intent AS "chineseIntent", c.created_at AS "createdAt"
      FROM public.captures c
      JOIN LATERAL (SELECT original_text, chinese_intent FROM public.capture_revisions
        WHERE capture_id = c.id ORDER BY revision_no DESC LIMIT 1) r ON true
      WHERE c.user_id = ${this.userId}::uuid
        ${text === undefined ? Prisma.empty : Prisma.sql`AND strpos(r.original_text COLLATE "C", ${text}) > 0`}
      ORDER BY c.created_at ASC, c.id ASC
      ${limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
    `));
    return rows.map(project);
  }

  async find(id: string): Promise<Capture | undefined> {
    if (!validId(id)) return undefined;
    const row = await this.database.run('find', () => this.database.client.capture.findFirst({
      where: { id, userId: this.userId },
      select: { id: true, createdAt: true, revisions: {
        orderBy: { revisionNo: 'desc' }, take: 1, select: { originalText: true, chineseIntent: true },
      } },
    }));
    if (!row) return undefined;
    const content = row.revisions[0];
    if (!content) throw new StorageFailureError();
    return project({ id: row.id, createdAt: row.createdAt, ...content });
  }

  private async writeRevision(id: string, change: RevisionContent | { chineseIntent: string | null }):
    Promise<{ revision: CaptureRevision; capture: Capture } | undefined> {
    if (!validId(id)) return undefined;
    const full = 'originalText' in change;
    const original = full ? Prisma.sql`${change.originalText}::text` : Prisma.sql`original_text`;
    const source = full ? Prisma.sql`${change.inputSource}::text` : Prisma.sql`input_source`;
    const chunks = full ? Prisma.sql`${change.chunks === null ? null : JSON.stringify(change.chunks)}::jsonb` : Prisma.sql`chunks`;
    const rows = await this.database.run('appendRevision', () => this.database.client.$queryRaw<{
      parentCreatedAt: Date; previousNo: number | null;
      id: string | null; captureId: string; revisionNo: number; originalText: string;
      chineseIntent: string | null; inputSource: 'manual' | 'unknown'; chunks: CaptureRevision['chunks']; createdAt: Date;
    }[]>(Prisma.sql`
      WITH previous AS (
        SELECT c.id AS capture_id, c.created_at AS parent_created_at, latest.*
        FROM public.captures c
        LEFT JOIN LATERAL (
          SELECT revision_no, original_text, chinese_intent, input_source, chunks
          FROM public.capture_revisions WHERE capture_id = c.id ORDER BY revision_no DESC LIMIT 1
        ) latest ON true
        WHERE c.id = ${id}::uuid AND c.user_id = ${this.userId}::uuid
      ), inserted AS (
        INSERT INTO public.capture_revisions
          (id, capture_id, revision_no, original_text, chinese_intent, input_source, chunks)
        SELECT ${randomUUID()}::uuid, capture_id, revision_no + 1, ${original},
          ${change.chineseIntent}::text, ${source}, ${chunks}
        FROM previous WHERE revision_no IS NOT NULL
        ON CONFLICT (capture_id, revision_no) DO NOTHING
        RETURNING *
      )
      SELECT p.parent_created_at AS "parentCreatedAt", p.revision_no AS "previousNo", ${revisionColumns}
      FROM previous p LEFT JOIN inserted r ON true
    `));
    const row = rows[0];
    if (!row) return undefined;
    if (row.previousNo === null) throw new StorageFailureError();
    if (row.id === null) throw new RevisionConflictError();
    const revision = projectRevision({ id: row.id, captureId: row.captureId, revisionNo: row.revisionNo,
      originalText: row.originalText, chineseIntent: row.chineseIntent, inputSource: row.inputSource,
      chunks: row.chunks, createdAt: row.createdAt });
    return { revision, capture: project({ id, originalText: row.originalText,
      chineseIntent: row.chineseIntent, createdAt: row.parentCreatedAt }) };
  }

  async appendRevision(id: string, content: RevisionContent): Promise<CaptureRevision | undefined> {
    return (await this.writeRevision(id, content))?.revision;
  }
  async updateIntent(id: string, chineseIntent: string | null): Promise<Capture | undefined> {
    return (await this.writeRevision(id, { chineseIntent }))?.capture;
  }

  async revisions(id: string, before: number | undefined, take: number): Promise<CaptureRevision[] | undefined> {
    if (!validId(id)) return undefined;
    // Keep the parent even if this page has no revisions: [] and 404 mean different things.
    const row = await this.database.run('revisions', () => this.database.client.capture.findFirst({
      where: { id, userId: this.userId }, select: { revisions: {
        where: before === undefined ? {} : { revisionNo: { lt: before } },
        orderBy: { revisionNo: 'desc' }, take,
      } },
    }));
    if (!row) return undefined;
    return row.revisions.map(r => projectRevision({ id: r.id, captureId: r.captureId,
      revisionNo: r.revisionNo, originalText: r.originalText, chineseIntent: r.chineseIntent,
      inputSource: r.inputSource as CaptureRevision['inputSource'],
      chunks: r.chunks as CaptureRevision['chunks'], createdAt: r.createdAt }));
  }
}
