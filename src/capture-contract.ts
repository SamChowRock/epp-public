import { z } from 'zod';
import { isPostgresText } from './postgres-text.js';
import type { Capture } from './capture.js';

export const OriginalTextSchema = z.string()
  .refine(isPostgresText, 'originalText must be well-formed Unicode without NUL')
  .regex(/\S/, 'originalText must contain a non-whitespace character')
  .refine(text => text.length <= 2000, 'originalText must be at most 2000 code units')
  .describe('Original text; whitespace is preserved. Maximum 2000 UTF-16 code units; well-formed Unicode without NUL.');

function createChineseIntentSchema(maxLength: number) {
  return z.string()
    .refine(isPostgresText, 'chineseIntent must be well-formed Unicode without NUL')
    .regex(/\S/, 'chineseIntent must contain a non-whitespace character')
    .refine(text => text.length <= maxLength,
      `chineseIntent must be at most ${maxLength} code units`)
    .describe(`User-supplied intent; whitespace preserved. Maximum ${maxLength} UTF-16 code units; well-formed Unicode without NUL. No language detection.`);
}

// Separate the write policy from values that readers must understand.
export const ChineseIntentSchema = createChineseIntentSchema(2000);
export const StoredChineseIntentSchema = createChineseIntentSchema(2000);

export const CreateCaptureSchema = z.object({
  originalText: OriginalTextSchema,
  chineseIntent: ChineseIntentSchema.nullable().optional(),
});
export const UpdateCaptureIntentSchema = z.object({
  chineseIntent: ChineseIntentSchema.nullable(),
});
export type UpdateCaptureIntentInput = z.infer<typeof UpdateCaptureIntentSchema>;
export type CreateCaptureInput = z.infer<typeof CreateCaptureSchema>;

export const ListQuerySchema = z.object({
  q: z.string().refine(isPostgresText, 'q must be well-formed Unicode without NUL').regex(/\S/, 'q must contain a non-whitespace character')
    .refine(text => text.length <= 200, 'q must be at most 200 code units')
    .describe('Literal, case-sensitive substring; maximum 200 UTF-16 code units; well-formed Unicode without NUL.').optional(),
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/)
    .describe('One decimal integer from 1 to 100; no signs, spaces or leading zeros.').optional(),
});

export const CaptureResponseSchema = z.object({
  id: z.uuid(),
  originalText: OriginalTextSchema,
  chineseIntent: StoredChineseIntentSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export const CaptureListResponseSchema = z.object({
  items: z.array(CaptureResponseSchema),
});
export const ProblemSchema = z.object({
  type: z.literal('about:blank'),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  code: z.string(),
  issues: z.array(z.object({
    path: z.array(z.union([z.string(), z.number().int()])),
    message: z.string(),
  })).optional(),
});
export type CaptureResponse = z.infer<typeof CaptureResponseSchema>;

export function toCaptureResponse(capture: Capture): CaptureResponse {
  return CaptureResponseSchema.parse({
    id: capture.id,
    originalText: capture.originalText,
    chineseIntent: capture.chineseIntent,
    createdAt: capture.createdAt,
  });
}
