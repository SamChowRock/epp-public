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
export const EmptyObjectSchema = z.object({}).strict();
const candidate = {
  id: z.uuid(), revisionId: z.uuid(), ...CreateCandidateSchema.shape,
  createdAt: z.iso.datetime(),
};
export const CandidateResponseSchema = z.discriminatedUnion('status', [
  z.object({ ...candidate, status: z.literal('pending'), discardedAt: z.null() }),
  z.object({ ...candidate, status: z.literal('discarded'), discardedAt: z.iso.datetime() }),
]);
export const CandidateListSchema = z.object({
  revisionId: z.uuid(), items: z.array(CandidateResponseSchema).max(5),
});
export type CreateCandidateInput = z.infer<typeof CreateCandidateSchema>;
export type Candidate = z.infer<typeof CandidateResponseSchema>;
