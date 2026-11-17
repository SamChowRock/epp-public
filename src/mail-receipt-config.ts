import { z } from 'zod';
import { ConfigError } from './config.js';
export const scopeSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/);
const schema = z.object({
  RESEND_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_[A-Za-z0-9+/=]+$/)
    .max(200),
  MAIL_PROVIDER_SCOPE: scopeSchema,
  MAIL_ENDPOINT_SCOPE: scopeSchema,
  MAIL_RECEIPT_PORT: z.coerce.number().int().min(1).max(65535).default(3354),
});
export function loadReceiptConfig(env: NodeJS.ProcessEnv) {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new ConfigError(String(result.error.issues[0]?.path[0]));
  return {
    secret: result.data.RESEND_WEBHOOK_SECRET,
    providerScope: result.data.MAIL_PROVIDER_SCOPE,
    endpointScope: result.data.MAIL_ENDPOINT_SCOPE,
    port: result.data.MAIL_RECEIPT_PORT,
  };
}
