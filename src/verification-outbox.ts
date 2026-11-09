import type { DatabaseService } from './database.service.js';
import type { RecoveryPurpose } from './recovery-contract.js';
import type { VerificationDelivery } from './verification-delivery.js';
import { issueToken, tokenDigest } from './token.js';
import { channelState, claimOne, type Claim } from './verification-claim.js';

type Job = { id: string; intent_id: string; generation: string; recipient: string; purpose: RecoveryPurpose };

async function prepare(database: DatabaseService, claim: Claim) {
  return database.client.$transaction(async tx => {
    const state = await channelState(tx, true);
    if (state !== 'open') {
      // Return only our own reservation; a successor may already hold this row.
      const held = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.verification_outbox
        WHERE id=${claim.id}::uuid AND status='pending' AND claim_id=${claim.claim_id}::uuid
        FOR UPDATE SKIP LOCKED`;
      if (!held.length) return state;
      await tx.$executeRaw`UPDATE public.verification_outbox SET claim_id=NULL, lease_until=NULL
        WHERE id=${claim.id}::uuid AND status='pending' AND claim_id=${claim.claim_id}::uuid AND lease_until > clock_timestamp()`;
      return state;
    }
    const [job] = await tx.$queryRaw<Job[]>`SELECT id,intent_id,generation,recipient,purpose
      FROM public.verification_outbox WHERE id=${claim.id}::uuid AND status='pending'
        AND claim_id=${claim.claim_id}::uuid FOR UPDATE`;
    if (!job) return 'stale';
    await tx.$queryRaw`SELECT id FROM public.verification_intents WHERE id=${job.intent_id}::uuid FOR UPDATE`;
    // Recheck the database clock AFTER any wait for the intent row.
    const marked = await tx.$executeRaw`UPDATE public.verification_outbox SET status='attempting'
      WHERE id=${job.id}::uuid AND status='pending' AND claim_id=${claim.claim_id}::uuid
        AND lease_until > clock_timestamp()`;
    if (!marked) return 'stale';
    const token = issueToken();
    const [window] = await tx.$queryRaw<{ issued_at: Date; expires_at: Date }[]>`
      UPDATE public.verification_intents SET token_digest=${tokenDigest(token)}
      WHERE id=${job.intent_id}::uuid AND token_digest=${job.generation}
        AND email=${job.recipient} AND purpose=${job.purpose}
        AND consumed_at IS NULL AND expires_at > clock_timestamp() RETURNING issued_at, expires_at
    `;
    if (!window) {
      await tx.verificationOutbox.update({ where: { id: job.id },
        data: { status: 'obsolete', claimId: null, leaseUntil: null } });
      return 'obsolete';
    }
    await tx.verificationMailControl.update({ where: { id: 1 }, data: { pausedBy: job.id } });
    return { job, token, window };
  }, { maxWait: 2000, timeout: 5000 });
}

async function finish(database: DatabaseService, claim: Claim, result: 'accepted' | 'unknown') {
  return database.client.$transaction(async tx => {
    const [channel] = await tx.$queryRaw<{ paused_by: string | null }[]>`
      SELECT paused_by FROM public.verification_mail_control WHERE id=1 FOR UPDATE`;
    if (channel?.paused_by !== claim.id) return 'lost-after-send';
    // Lock first: a wall-clock predicate evaluated before a lock wait is insufficient.
    await tx.$queryRaw`SELECT id FROM public.verification_outbox WHERE id=${claim.id}::uuid FOR UPDATE`;
    const count = await tx.$executeRaw`UPDATE public.verification_outbox
      SET status=${result}, claim_id=NULL, lease_until=NULL
      WHERE id=${claim.id}::uuid AND status='attempting'
        AND claim_id=${claim.claim_id}::uuid AND lease_until > clock_timestamp()`;
    if (count !== 1) return 'lost-after-send';
    if (result === 'accepted') {
      await tx.verificationMailControl.update({ where: { id: 1 }, data: { pausedBy: null } });
    }
    return result;
  });
}

export async function deliverClaim(database: DatabaseService, delivery: VerificationDelivery, claim: Claim) {
  const prepared = await prepare(database, claim);
  if (typeof prepared === 'string') return prepared;
  const { job, token, window } = prepared;
  let outcome: 'accepted' | 'unknown' = 'accepted';
  try { await delivery.send(job.recipient, job.purpose, token, window.issued_at, window.expires_at); }
  catch { outcome = 'unknown'; }
  return finish(database, claim, outcome);
}

export async function sendOne(database: DatabaseService, delivery: VerificationDelivery, messageId?: string) {
  const claim = await claimOne(database, messageId);
  return typeof claim === 'string' ? claim : deliverClaim(database, delivery, claim);
}
