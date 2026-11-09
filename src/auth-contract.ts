import { z } from 'zod';
import { isPostgresText } from './postgres-text.js';

export const UserIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const PasswordInput = z.string().min(1).max(256).refine(value => value.isWellFormed());
export const LoginSchema = z.object({
  userId: UserIdSchema, password: PasswordInput,
  label: z.string().min(1).max(60).refine(isPostgresText).regex(/\S/).default('Current login'),
}).strict();
export const ChangePasswordSchema = z.object({ currentPassword: PasswordInput, newPassword: PasswordInput }).strict();
export const SessionIdentitySchema = z.object({ userId: UserIdSchema, sessionId: z.uuid() });
export const SessionListSchema = z.object({ items: z.array(z.object({
  id: z.uuid(), label: z.string(), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), current: z.boolean(),
})) });
export type LoginInput = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
