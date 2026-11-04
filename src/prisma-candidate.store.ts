import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Prisma } from './generated/prisma/client.js';
import { DatabaseService } from './database.service.js';
import { DEVELOPMENT_USER_ID } from './database-config.js';
import { AcceptanceSchema, CandidateResponseSchema } from './candidate-contract.js';
import type { Acceptance, Candidate, CreateCandidateInput } from './candidate-contract.js';

const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
type Row = { id: string; revisionId: string; candidateNo: number; englishText: string;
  chineseMeaning: string; status: string; discardedAt: Date | null; acceptedAt: Date | null; createdAt: Date };
type OuterRow = Omit<Row, 'id'> & { id: string | null };
const columns = Prisma.sql`n.id, n.revision_id AS "revisionId", n.candidate_no AS "candidateNo",
  n.english_text AS "englishText", n.chinese_meaning AS "chineseMeaning", n.status,
  n.discarded_at AS "discardedAt", n.accepted_at AS "acceptedAt", n.created_at AS "createdAt"`;
function project(row: Row): Candidate {
  return CandidateResponseSchema.parse({ ...row, createdAt: row.createdAt.toISOString(),
    discardedAt: row.discardedAt?.toISOString() ?? null, acceptedAt: row.acceptedAt?.toISOString() ?? null });
}

export class PrismaCandidateStore {
  constructor(private readonly database: DatabaseService) {}

  async create(revisionId: string, input: CreateCandidateInput): Promise<Candidate | 'occupied' | undefined> {
    if (!validId(revisionId)) return undefined;
    const rows = await this.database.run('createCandidate', () => this.database.client.$queryRaw<OuterRow[]>(Prisma.sql`
      WITH owned AS (
        SELECT r.id FROM public.capture_revisions r JOIN public.captures c ON c.id = r.capture_id
        WHERE r.id = ${revisionId}::uuid AND c.user_id = ${DEVELOPMENT_USER_ID}::uuid
      ), inserted AS (
        INSERT INTO public.candidates (id, revision_id, candidate_no, english_text, chinese_meaning)
        SELECT ${randomUUID()}::uuid, id, ${input.candidateNo}, ${input.englishText}, ${input.chineseMeaning}
        FROM owned
        ON CONFLICT (revision_id, candidate_no) DO NOTHING RETURNING *
      )
      SELECT ${columns} FROM owned LEFT JOIN inserted n ON true
    `));
    const row = rows[0];
    if (!row) return undefined;
    if (row.id === null) return 'occupied';
    return project({ ...row, id: row.id });
  }

  async list(revisionId: string): Promise<Candidate[] | undefined> {
    if (!validId(revisionId)) return undefined;
    const rows = await this.database.run('listCandidates', () => this.database.client.$queryRaw<OuterRow[]>(Prisma.sql`
      SELECT ${columns} FROM public.capture_revisions r
      JOIN public.captures c ON c.id = r.capture_id
      LEFT JOIN public.candidates n ON n.revision_id = r.id
      WHERE r.id = ${revisionId}::uuid AND c.user_id = ${DEVELOPMENT_USER_ID}::uuid
      ORDER BY n.candidate_no ASC
    `));
    if (rows.length === 0) return undefined;
    return rows.flatMap(row => row.id === null ? [] : [project({ ...row, id: row.id })]);
  }

  async accept(id: string, operationId: string): Promise<Acceptance | 'conflict' | 'operation-conflict' | undefined> {
    if (!validId(id)) return undefined;
    const action = 'accept-candidate/v1';
    const fingerprint = createHash('sha256').update(JSON.stringify([action, id])).digest('hex');
    const lockKey = JSON.stringify(['command', DEVELOPMENT_USER_ID, operationId]);
    return this.database.run('acceptCandidate', async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.database.client.$transaction(async tx => {
            await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
            // Serialize one operation even before its durable result row exists.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
            const candidate = await tx.candidate.findFirst({
              where: { id, revision: { capture: { userId: DEVELOPMENT_USER_ID } } },
            });
            if (!candidate) return undefined;
            const previous = await tx.commandReceipt.findUnique({
              where: { userId_operationId: { userId: DEVELOPMENT_USER_ID, operationId } },
            });
            if (previous) {
              if (previous.action !== action || previous.candidateId !== id
                || previous.fingerprint !== fingerprint) return 'operation-conflict';
              return AcceptanceSchema.parse(previous.response);
            }
            if (candidate.status !== 'pending') return 'conflict';
            const acceptedAt = new Date();
            const claimed = await tx.candidate.updateMany({ where: { id, status: 'pending' },
              data: { status: 'accepted', acceptedAt } });
            if (claimed.count !== 1) return 'conflict';
            const [identity] = await tx.$queryRaw<{ normalizedText: string; normalizedMeaning: string; key: string }[]>`
              SELECT public.epp_normalize_v1(${candidate.englishText}) AS "normalizedText",
                public.epp_normalize_v1(${candidate.chineseMeaning}) AS "normalizedMeaning",
                public.epp_identity_v1(${candidate.englishText}, ${candidate.chineseMeaning}) AS key
            `;
            if (!identity) throw new Error('Expression identity is missing');
            const expressionLock = JSON.stringify(['expression', DEVELOPMENT_USER_ID, identity.key]);
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${expressionLock}, 0))::text`;
            // Read after acquiring the lock so a preceding commit is visible at READ COMMITTED.
            let expression = await tx.expression.findUnique({
              where: { userId_semanticKey: { userId: DEVELOPMENT_USER_ID, semanticKey: identity.key } },
              include: { forms: true },
            });
            if (expression) {
              if (expression.normalizedMeaning !== identity.normalizedMeaning || expression.forms.length !== 1
                || expression.forms[0]?.normalizedText !== identity.normalizedText) {
                throw new Error('Expression identity does not match');
              }
            } else {
              expression = await tx.expression.create({ data: {
                id: randomUUID(), userId: DEVELOPMENT_USER_ID, meaning: candidate.chineseMeaning,
                normalizedMeaning: identity.normalizedMeaning, semanticKey: identity.key,
                forms: { create: { id: randomUUID(), text: candidate.englishText,
                  normalizedText: identity.normalizedText } },
              }, include: { forms: true } });
            }
            const learningRecord = await tx.learningRecord.create({ data: {
              id: randomUUID(), userId: DEVELOPMENT_USER_ID, candidateId: id, expressionId: expression.id,
            } });
            const response = AcceptanceSchema.parse({
              candidate: project({ ...candidate, status: 'accepted', acceptedAt }),
              expression: { ...expression, createdAt: expression.createdAt.toISOString() },
              learningRecord: { ...learningRecord, createdAt: learningRecord.createdAt.toISOString() },
            });
            await tx.commandReceipt.create({ data: {
              userId: DEVELOPMENT_USER_ID, operationId, action, candidateId: id, fingerprint,
              statusCode: 201, response,
            } });
            return response;
          }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2000, timeout: 5000 });
        } catch (error) {
          // Retry only a known aborted transaction, never an unknown commit outcome.
          if (!(error instanceof Prisma.PrismaClientKnownRequestError)
            || error.code !== 'P2034' || attempt >= 2) throw error;
          await delay(25 * 2 ** attempt + Math.floor(Math.random() * 25));
        }
      }
    });
  }

  async discard(id: string): Promise<Candidate | 'conflict' | undefined> {
    if (!validId(id)) return undefined;
    const rows = await this.database.run('discardCandidate', () => this.database.client.$queryRaw<OuterRow[]>(Prisma.sql`
      WITH owned AS (
        SELECT n.id FROM public.candidates n
        JOIN public.capture_revisions r ON r.id = n.revision_id
        JOIN public.captures c ON c.id = r.capture_id
        WHERE n.id = ${id}::uuid AND c.user_id = ${DEVELOPMENT_USER_ID}::uuid
      ), changed AS (
        UPDATE public.candidates n SET status = 'discarded', discarded_at = statement_timestamp()
        FROM owned WHERE n.id = owned.id AND n.status = 'pending' RETURNING n.*
      )
      SELECT ${columns} FROM owned LEFT JOIN changed n ON true
    `));
    const row = rows[0];
    if (!row) return undefined;
    if (row.id === null) return 'conflict';
    return project({ ...row, id: row.id });
  }
}
