import { z } from 'zod';
import { UserIdSchema, SessionIdentitySchema } from './auth-contract.js';
import { isPostgresText } from './postgres-text.js';
export const MINI_PUBLIC_PATHS = ['/auth/mini/login', '/auth/mini/link'];
export const MiniLoginSchema = z.object({
  code: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/),
  label: z.string().min(1).max(60).refine(isPostgresText).regex(/\S/).default('Mini program'),
}).strict();
export const MiniLinkSchema = MiniLoginSchema.extend({
  userId: UserIdSchema,
  password: z.string().min(1).max(256).refine(value => value.isWellFormed()),
});
export const MiniLoginResultSchema = z.union([z.object({ userId: UserIdSchema, miniEnabled: z.literal(false) }), SessionIdentitySchema.extend({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), expiresIn: z.literal(28800),
})]);
export type MiniLogin = z.infer<typeof MiniLoginSchema>;
export type MiniLink = z.infer<typeof MiniLinkSchema>;
