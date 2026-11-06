import { z } from 'zod';
import { tokenDigest } from './token.js';

// Product identity policy: ASCII addresses are case-insensitive; dots and +tags are preserved.
export const EmailSchema = z.string().trim().max(254).regex(/^[\x21-\x7e]+$/)
  .pipe(z.email()).refine(value => value.split('@')[0]!.length <= 64)
  .transform(value => value.toLowerCase());
export const RecoveryRequestSchema = z.object({ email: EmailSchema }).strict();
export const RecoveryConfirmSchema = z.object({
  token: z.string().refine(value => { try { tokenDigest(value); return true; } catch { return false; } }),
  newPassword: z.string().min(1).max(256).refine(value => value.isWellFormed()),
}).strict();
export const RecoveryAcceptedSchema = z.object({ message: z.literal('Check your inbox. If no message arrives, wait one minute before trying again.') });
export const RegistrationSchema = z.object({ userId: z.uuid(), webEnabled: z.literal(false) });
export type RecoveryPurpose = 'register' | 'reset';
export type RecoveryConfirm = z.infer<typeof RecoveryConfirmSchema>;
export const RECOVERY_PATHS = ['/auth/register/request', '/auth/register/confirm', '/auth/reset/request', '/auth/reset/confirm'];
