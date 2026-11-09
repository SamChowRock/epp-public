import { z } from 'zod';
import { UserIdSchema } from './auth-contract.js';

export const ExternalStart = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('login') }).strict(),
  z.object({ mode: z.literal('link'), userId: UserIdSchema, password: z.string().min(1).max(256).refine(s => s.isWellFormed()) }).strict(),
]);
