import type { DatabaseService } from './database.service.js';
import type { RecoveryPurpose } from './recovery-contract.js';
import type { VerificationDelivery } from './verification-delivery.js';
import { issueToken, tokenDigest } from './token.js';

type Job = { id: string; intent_id: string; generation: string; recipient: string; purpose: RecoveryPurpose };

export async function sendOne(database: DatabaseService, delivery: VerificationDelivery, messageId?: string) {
  const prepared = await database.client.$transaction(async tx => {
    const [job] = await tx.$queryRaw<Job[]>`
      SELECT id, intent_id, generation, recipient, purpose FROM public.verification_outbox
      WHERE status = 'pending' AND available_at <= clock_timestamp()
        AND (${messageId ?? null}::uuid IS NULL OR id = ${messageId ?? null}::uuid)
      ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
    `;
    if (!job) return null;
    await tx.$queryRaw`SELECT id FROM public.verification_intents WHERE id = ${job.intent_id}::uuid FOR UPDATE`;
    const token = issueToken();
    const [window] = await tx.$queryRaw<{ issued_at: Date; expires_at: Date }[]>`
      UPDATE public.verification_intents SET token_digest = ${tokenDigest(token)}
      WHERE id = ${job.intent_id}::uuid AND token_digest = ${job.generation}
        AND email = ${job.recipient} AND purpose = ${job.purpose}
        AND consumed_at IS NULL AND expires_at > clock_timestamp()
      RETURNING issued_at, expires_at
    `;
    await tx.verificationOutbox.update({ where: { id: job.id },
      data: { status: window ? 'attempting' : 'obsolete' } });
    return { job, token, window };
  }, { maxWait: 2000, timeout: 5000 });
  if (!prepared) return 'empty';
  if (!prepared.window) return 'obsolete';
  const { job, token, window } = prepared;
  let status: 'accepted' | 'unknown' = 'accepted';
  try { await delivery.send(job.recipient, job.purpose, token, window.issued_at, window.expires_at); }
  catch { status = 'unknown'; }
  await database.client.verificationOutbox.update({ where: { id: job.id }, data: { status } });
  return status;
}
