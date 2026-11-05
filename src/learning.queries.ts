import { pageRequest, pageResult } from './pagination.js';
import type { Prisma } from './generated/prisma/client.js';
import { DatabaseService } from './database.service.js';
import { DEVELOPMENT_USER_ID } from './database-config.js';
import { ApplicationState } from './application-state.js';
import { HttpError } from './http.js';
import type { LearningQuery } from './learning-contract.js';

const ownedRecord = {
  userId: DEVELOPMENT_USER_ID,
  expression: { userId: DEVELOPMENT_USER_ID },
  candidate: { revision: { capture: { userId: DEVELOPMENT_USER_ID } } },
} satisfies Prisma.LearningRecordWhereInput;
const expressionSelect = {
  id: true, meaning: true, createdAt: true,
  forms: { select: { text: true }, orderBy: { id: 'asc' }, take: 2 },
} satisfies Prisma.ExpressionSelect;
const recordSelect = {
  id: true, createdAt: true, expression: { select: expressionSelect },
  candidate: { select: { id: true, revision: { select: {
    id: true, captureId: true, revisionNo: true,
  } } } },
} satisfies Prisma.LearningRecordSelect;
type ExpressionRow = Prisma.ExpressionGetPayload<{ select: typeof expressionSelect }>;
type RecordRow = Prisma.LearningRecordGetPayload<{ select: typeof recordSelect }>;
function expressionView(row: ExpressionRow) {
  if (row.forms.length !== 1) throw new Error('Expected one expression form');
  return { id: row.id, text: row.forms[0]!.text, meaning: row.meaning, createdAt: row.createdAt.toISOString() };
}
function recordView(row: RecordRow) {
  return { id: row.id, createdAt: row.createdAt.toISOString(), expression: expressionView(row.expression),
    source: { candidateId: row.candidate.id, revisionId: row.candidate.revision.id,
      captureId: row.candidate.revision.captureId, revisionNo: row.candidate.revision.revisionNo } };
}

export class LearningQueries {
  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState, private readonly cursorKey: string) {}

  list(query: LearningQuery) {
    const page = pageRequest(query, 'learning-records', DEVELOPMENT_USER_ID, this.cursorKey);
    const { limit } = page;
    return this.state.track(() => this.database.run('listLearningRecords', async () => {
      const rows = await this.database.client.learningRecord.findMany({
        where: { ...ownedRecord, ...page.where, ...(query.expressionId ? { expressionId: query.expressionId } : {}) },
        select: recordSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, skip: page.offset,
      });
      return { items: rows.slice(0, limit).map(recordView), limit, hasMore: rows.length > limit, ...pageResult(page, rows, this.cursorKey) };
    }));
  }

  async detail(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
      throw new HttpError(404, 'Learning record not found', 'LEARNING_RECORD_NOT_FOUND');
    }
    const result = await this.state.track(() => this.database.run('findLearningRecord', async () => {
      const row = await this.database.client.learningRecord.findFirst({
        where: { ...ownedRecord, id }, select: { ...recordSelect, candidate: { select: {
          id: true, englishText: true, chineseMeaning: true,
          revision: { select: { id: true, captureId: true, revisionNo: true, originalText: true, chineseIntent: true } },
        } } },
      });
      if (!row) return undefined;
      const summary = recordView(row);
      return { ...summary, source: { ...summary.source,
        originalText: row.candidate.revision.originalText, chineseIntent: row.candidate.revision.chineseIntent,
        englishText: row.candidate.englishText, chineseMeaning: row.candidate.chineseMeaning } };
    }));
    if (!result) throw new HttpError(404, 'Learning record not found', 'LEARNING_RECORD_NOT_FOUND');
    return result;
  }

  starMap(query: Omit<LearningQuery, 'expressionId'>) {
    const page = pageRequest(query, 'star-map', DEVELOPMENT_USER_ID, this.cursorKey);
    const { limit } = page;
    return this.state.track(() => this.database.run('readStarMap', async () => {
      const rows = await this.database.client.expression.findMany({
        where: { ...page.where, userId: DEVELOPMENT_USER_ID, learningRecords: { some: ownedRecord } },
        select: { ...expressionSelect, _count: { select: { learningRecords: { where: ownedRecord } } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, skip: page.offset,
      });
      return { nodes: rows.slice(0, limit).map(row => ({ ...expressionView(row), recordCount: row._count.learningRecords })),
        limit, hasMore: rows.length > limit, ...pageResult(page, rows, this.cursorKey) };
    }));
  }
}
