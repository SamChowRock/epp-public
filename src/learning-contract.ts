import { z } from 'zod';
import { OriginalTextSchema, StoredChineseIntentSchema } from './capture-contract.js';

export const LearningQuerySchema = z.object({
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/).optional(),
  expressionId: z.uuid().regex(/^[0-9a-f-]+$/).optional(),
}).strict();
export const StarMapQuerySchema = LearningQuerySchema.omit({ expressionId: true });
export type LearningQuery = z.infer<typeof LearningQuerySchema>;
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
  items: z.array(LearningSummarySchema).max(100), limit: z.number().int().min(1).max(100), hasMore: z.boolean(),
});
export const LearningDetailSchema = LearningSummarySchema.extend({
  source: LearningSummarySchema.shape.source.extend({
    originalText: OriginalTextSchema, chineseIntent: StoredChineseIntentSchema.nullable(),
    englishText: OriginalTextSchema, chineseMeaning: OriginalTextSchema,
  }),
});
export const StarMapSchema = z.object({
  nodes: z.array(ExpressionSummarySchema.extend({ recordCount: z.number().int().positive() })).max(100),
  limit: z.number().int().min(1).max(100), hasMore: z.boolean(),
});
