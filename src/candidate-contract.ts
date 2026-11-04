import { z } from 'zod';
import { isPostgresText } from './postgres-text.js';

const text = z.string().refine(isPostgresText, 'Expected well-formed Unicode without NUL')
  .regex(/\S/, 'Expected a non-whitespace character')
  .refine(value => value.length <= 2000, 'Expected at most 2000 UTF-16 code units')
  .describe('Whitespace preserved; at most 2000 UTF-16 code units. No language detection.');
export const CreateCandidateSchema = z.object({
  candidateNo: z.number().int().min(1).max(5),
  englishText: text,
  chineseMeaning: text,
}).strict();
export const AcceptCandidateSchema = z.object({
  operationId: z.uuid().regex(/^[0-9a-f-]+$/, 'Expected a lowercase UUID'),
}).strict();
export type AcceptCandidateInput = z.infer<typeof AcceptCandidateSchema>;
export const EmptyObjectSchema = z.object({}).strict();
const candidate = {
  id: z.uuid(), revisionId: z.uuid(), ...CreateCandidateSchema.shape,
  createdAt: z.iso.datetime(),
};
export const CandidateResponseSchema = z.discriminatedUnion('status', [
  z.object({ ...candidate, status: z.literal('pending'), discardedAt: z.null(), acceptedAt: z.null() }),
  z.object({ ...candidate, status: z.literal('discarded'), discardedAt: z.iso.datetime(), acceptedAt: z.null() }),
  z.object({ ...candidate, status: z.literal('accepted'), discardedAt: z.null(), acceptedAt: z.iso.datetime() }),
]);
export const CandidateListSchema = z.object({
  revisionId: z.uuid(), items: z.array(CandidateResponseSchema).max(5),
});
export type CreateCandidateInput = z.infer<typeof CreateCandidateSchema>;
export type Candidate = z.infer<typeof CandidateResponseSchema>;

export const AcceptanceSchema = z.object({
  candidate: CandidateResponseSchema,
  expression: z.object({ id: z.uuid(), meaning: text, createdAt: z.iso.datetime(),
    forms: z.array(z.object({ id: z.uuid(), text })).length(1) }),
  learningRecord: z.object({ id: z.uuid(), candidateId: z.uuid(), expressionId: z.uuid(), createdAt: z.iso.datetime() }),
});
export type Acceptance = z.infer<typeof AcceptanceSchema>;
