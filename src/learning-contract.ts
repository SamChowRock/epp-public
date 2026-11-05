import { z } from 'zod';
import { OriginalTextSchema, StoredChineseIntentSchema } from './capture-contract.js';

const InstantSchema = z.iso.datetime({ precision: 3 }).refine(value => {
  const date = new Date(value);
  return !value.startsWith('0000-') && Number.isFinite(date.getTime()) &&
    date.toISOString() === value;
}, 'Expected a UTC millisecond instant in years 0001..9999');
const PageQuerySchema = z.object({
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/).optional(),
  mode: z.enum(['offset', 'cursor']).optional(),
  offset: z.string().regex(/^(?:0|[1-9]\d{0,3}|10000)$/).optional(),
  cursor: z.string().min(1).max(2048).optional(),
  from: InstantSchema.optional(), to: InstantSchema.optional(),
}).strict();
function validPage(query: z.infer<typeof PageQuerySchema>) {
  return (query.offset === undefined || query.mode === 'offset') &&
    (query.cursor === undefined || query.mode === 'cursor') &&
    !(query.from && query.to && query.from >= query.to);
}
export const LearningQuerySchema = PageQuerySchema.extend({
  expressionId: z.uuid().regex(/^[0-9a-f-]+$/).optional(),
}).refine(validPage, 'Invalid pagination mode or time range');
export const StarMapQuerySchema = PageQuerySchema.refine(validPage, 'Invalid pagination mode or time range');
export type LearningQuery = z.infer<typeof LearningQuerySchema>;
const PageInfo = {
  nextCursor: z.string().nullable().optional(),
  nextOffset: z.number().int().nonnegative().nullable().optional(),
};
export const ExpressionSummarySchema = z.object({
  id: z.uuid(), text: OriginalTextSchema, meaning: OriginalTextSchema,
  createdAt: z.iso.datetime(),
});
export const LearningSummarySchema = z.object({
  id: z.uuid(), createdAt: z.iso.datetime(), expression: ExpressionSummarySchema,
  source: z.object({ candidateId: z.uuid(), revisionId: z.uuid(), captureId: z.uuid(),
    revisionNo: z.number().int().positive() }),
});
export const LearningListSchema = z.object({
  ...PageInfo, items: z.array(LearningSummarySchema).max(100), limit: z.number().int().min(1).max(100), hasMore: z.boolean(),
});
export const LearningDetailSchema = LearningSummarySchema.extend({
  source: LearningSummarySchema.shape.source.extend({
    originalText: OriginalTextSchema, chineseIntent: StoredChineseIntentSchema.nullable(),
    englishText: OriginalTextSchema, chineseMeaning: OriginalTextSchema,
  }),
});
export const StarMapSchema = z.object({
  ...PageInfo,
  nodes: z.array(ExpressionSummarySchema.extend({ recordCount: z.number().int().positive() })).max(100),
  limit: z.number().int().min(1).max(100), hasMore: z.boolean(),
});
