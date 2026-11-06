import { EmailSchema } from './recovery-contract.js';
import { z } from 'zod';
import { isPostgresText } from './postgres-text.js';

export const UserIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const PasswordInput = z.string().min(1).max(256).refine(value => value.isWellFormed());
const LoginFields = { password: PasswordInput,
  label: z.string().min(1).max(60).refine(isPostgresText).regex(/\S/).default('Current login'),
};
export const LoginSchema = z.union([
  z.object({ userId: UserIdSchema, ...LoginFields }).strict(),
  z.object({ email: EmailSchema, ...LoginFields }).strict(),
]);
export const ChangePasswordSchema = z.object({ currentPassword: PasswordInput, newPassword: PasswordInput }).strict();
export const SessionIdentitySchema = z.object({ userId: z.uuid(), sessionId: z.uuid() });
export const SessionListSchema = z.object({ items: z.array(z.object({
  id: z.uuid(), label: z.string(), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), current: z.boolean(),
})) });
export type LoginInput = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const CsrfSchema = z.object({ csrfToken: z.string().regex(/^[0-9a-f]{64}$/) });
