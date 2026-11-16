import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Prisma } from './generated/prisma/client.js';
import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import { AppendRevisionSchema, CreateCaptureSchema, CaptureResponseSchema, RevisionResponseSchema } from './capture-contract.js';
import type { Capture } from './capture.js';
import type { CaptureRevision } from './capture-revision.js';
import { RevisionConflictError } from './capture-revision.js';
import { CaptureNotFoundError, InvalidCaptureError } from './captures.service.js';
import { OperationConflictError } from './candidates.service.js';
import { StorageFailureError } from './database-errors.js';
import { HttpError } from './http.js';

const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export function validateIdempotencyKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !validId(key)) {
    throw new HttpError(400, 'Idempotency-Key must be one lowercase UUID', 'INVALID_IDEMPOTENCY_KEY');
  }
}
type Content = { originalText: string; chineseIntent: string | null; inputSource?: 'manual'; chunks?: { text: string }[] | null };

/** userId comes only from the server's identity provider, never the request body. */
export class CaptureCommands {
  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState,
    private readonly userId: string) {}

  async create(key: string, input: unknown): Promise<Capture> {
    validateIdempotencyKey(key);
    const parsed = CreateCaptureSchema.safeParse(input);
    if (!parsed.success) throw new InvalidCaptureError('Invalid capture content');
    return this.execute('create-capture/v1', key, null, {
      originalText: parsed.data.originalText, chineseIntent: parsed.data.chineseIntent ?? null,
    }) as Promise<Capture>;
  }
  async appendRevision(id: string, key: string, input: unknown): Promise<CaptureRevision> {
    validateIdempotencyKey(key);
    if (!validId(id)) throw new CaptureNotFoundError('Capture not found');
    const parsed = AppendRevisionSchema.safeParse(input);
    if (!parsed.success) throw new InvalidCaptureError('Invalid revision content');
    return this.execute('append-revision/v1', key, id, {
      originalText: parsed.data.originalText, chineseIntent: parsed.data.chineseIntent,
      inputSource: 'manual', chunks: parsed.data.chunks ?? null,
    }) as Promise<CaptureRevision>;
  }

  private async execute(action: string, operationId: string, target: string | null, content: Content) {
    const fingerprint = createHash('sha256').update(JSON.stringify([action, target, content])).digest('hex');
    const result = await this.state.track(() => this.database.run('captureCommand', async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.database.client.$transaction(async tx => {
            await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
            const lockKey = JSON.stringify(['capture-write', this.userId, action, operationId]);
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
            // Separate statement after acquiring the lock: READ COMMITTED gets a fresh snapshot.
            const previous = await tx.captureWriteReceipt.findUnique({
              where: { userId_action_operationId: { userId: this.userId, action, operationId } },
            });
            const captureId = target ?? previous?.captureId ?? randomUUID();
            if (target !== null || previous) {
              const owned = await tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM public.captures WHERE id = ${captureId}::uuid
                AND user_id = ${this.userId}::uuid FOR SHARE`;
              if (!owned.length) return 'missing' as const;
            }
            if (previous) {
              if (previous.fingerprint !== fingerprint || (target !== null && previous.captureId !== target)) {
                return 'operation-conflict' as const;
              }
              if (previous.statusCode !== 201 || previous.location !== (target === null ? `/captures/${captureId}` : null)) {
                throw new StorageFailureError();
              }
              const response = target === null ? CaptureResponseSchema.parse(previous.response) : RevisionResponseSchema.parse(previous.response);
              if ((target === null ? response.id : (response as CaptureRevision).captureId) !== captureId) throw new StorageFailureError();
              return response;
            }
            let response: Capture | CaptureRevision;
            if (target === null) {
              const now = new Date();
              await tx.capture.create({ data: { id: captureId, userId: this.userId,
                originalText: content.originalText, chineseIntent: content.chineseIntent, createdAt: now,
                revisions: { create: { id: randomUUID(), revisionNo: 1,
                  originalText: content.originalText, chineseIntent: content.chineseIntent,
                  inputSource: 'manual', chunks: Prisma.DbNull, createdAt: now } },
              }, select: { id: true } });
              response = CaptureResponseSchema.parse({ id: captureId, ...content, createdAt: now.toISOString() });
            } else {
              const rows = await tx.$queryRaw<{ id: string; captureId: string; revisionNo: number; createdAt: Date }[]>`
                INSERT INTO public.capture_revisions
                  (id, capture_id, revision_no, original_text, chinese_intent, input_source, chunks)
                SELECT ${randomUUID()}::uuid, ${captureId}::uuid, revision_no + 1,
                  ${content.originalText}, ${content.chineseIntent}, 'manual',
                  ${content.chunks === null ? null : JSON.stringify(content.chunks)}::jsonb
                FROM public.capture_revisions WHERE capture_id = ${captureId}::uuid
                ORDER BY revision_no DESC LIMIT 1
                ON CONFLICT (capture_id, revision_no) DO NOTHING
                RETURNING id, capture_id AS "captureId", revision_no AS "revisionNo", created_at AS "createdAt"`;
              if (!rows[0]) {
                const existing = await tx.captureRevision.count({ where: { captureId } });
                if (!existing) throw new StorageFailureError();
                return 'revision-conflict' as const;
              }
              response = RevisionResponseSchema.parse({ ...content, ...rows[0], createdAt: rows[0].createdAt.toISOString() });
            }
            await tx.captureWriteReceipt.create({ data: { userId: this.userId, action, operationId,
              captureId, fingerprint, statusCode: 201, location: target === null ? `/captures/${captureId}` : null,
              response: response as Prisma.InputJsonValue,
            } });
            return response;
          }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2000, timeout: 5000 });
        } catch (error) {
          // Only known-aborted transactions can retry; unknown commit outcomes escape.
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2) throw error;
          await delay(25 * 2 ** attempt + Math.floor(Math.random() * 25));
        }
      }
    }));
    if (result === 'missing') throw new CaptureNotFoundError('Capture not found');
    if (result === 'operation-conflict') throw new OperationConflictError('Operation identity was already used for another request');
    if (result === 'revision-conflict') throw new RevisionConflictError();
    return result;
  }
}
