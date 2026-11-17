import { z } from 'zod';
import {
  LocalMailDelivery,
  type VerificationDelivery,
} from './verification-delivery.js';
import { ResendDelivery } from './resend-delivery.js';
const scopeSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/);
import { ConfigError, mailPortSchema } from './config.js';
export function createDelivery(env: NodeJS.ProcessEnv): VerificationDelivery {
  if ((env.MAIL_PROVIDER ?? 'local') === 'local') {
    const port = mailPortSchema.safeParse(env.LOCAL_SMTP_PORT);
    if (!port.success) throw new ConfigError('LOCAL_SMTP_PORT');
    return new LocalMailDelivery({ localSmtpPort: port.data });
  }
  if (env.MAIL_PROVIDER !== 'resend') throw new ConfigError('MAIL_PROVIDER');
  const s = z
    .object({
      RESEND_API_KEY: z.string().min(1).max(500),
      RESEND_FROM: z.string().email().max(320),
      MAIL_PROVIDER_SCOPE: scopeSchema,
    })
    .safeParse(env);
  if (!s.success) throw new ConfigError(String(s.error.issues[0]?.path[0]));
  return new ResendDelivery({
    apiKey: s.data.RESEND_API_KEY,
    from: s.data.RESEND_FROM,
    providerScope: s.data.MAIL_PROVIDER_SCOPE,
  });
}
