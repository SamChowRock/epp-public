import { providerUuid } from './resend-delivery.js';
import { randomUUID } from 'node:crypto';
import {
  bindAttemptTx,
  mailTransactionOptions,
} from './mail-delivery-facts.js';
import type { DatabaseService } from './database.service.js';
import type { RecoveryPurpose } from './recovery-contract.js';
import type { VerificationDelivery } from './verification-delivery.js';
import { issueToken, tokenDigest } from './token.js';
import { channelState, claimOne, type Claim } from './verification-claim.js';

import { classifyMailFailure } from './mail-failure.js';

type Job = {
  id: string;
  intent_id: string;
  expected_digest: string;
  attempts: number;
  recipient: string;
  purpose: RecoveryPurpose;
};

async function prepare(
  database: DatabaseService,
  claim: Claim,
  delivery: VerificationDelivery,
) {
  return database.client.$transaction(
    async (tx) => {
      const state = await channelState(tx, true);
      if (state !== 'open') {
        // Return only our own reservation; a successor may already hold this row.
        const held = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM public.verification_outbox
        WHERE id=${claim.id}::uuid AND status='pending' AND claim_id=${claim.claim_id}::uuid
        FOR UPDATE SKIP LOCKED`;
        if (!held.length) return state;
        await tx.$executeRaw`UPDATE public.verification_outbox SET claim_id=NULL, lease_until=NULL
        WHERE id=${claim.id}::uuid AND status='pending' AND claim_id=${claim.claim_id}::uuid AND lease_until > clock_timestamp()`;
        return state;
      }
      const [job] = await tx.$queryRaw<
        Job[]
      >`SELECT id,intent_id,COALESCE(retry_digest,generation) AS expected_digest,attempts,recipient,purpose
      FROM public.verification_outbox WHERE id=${claim.id}::uuid AND status='pending'
        AND claim_id=${claim.claim_id}::uuid FOR UPDATE`;
      if (!job) return 'stale';
      await tx.$queryRaw`SELECT id FROM public.verification_intents WHERE id=${job.intent_id}::uuid FOR UPDATE`;
      // Recheck the database clock AFTER any wait for the intent row.
      const marked =
        await tx.$executeRaw`UPDATE public.verification_outbox SET status='attempting'
      WHERE id=${job.id}::uuid AND status='pending' AND claim_id=${claim.claim_id}::uuid
        AND lease_until > clock_timestamp()`;
      if (!marked) return 'stale';
      await tx.$executeRaw`INSERT INTO verification_mail_addresses(recipient) VALUES(${job.recipient}) ON CONFLICT DO NOTHING`;
      const [address] = await tx.$queryRaw<
        { epoch: bigint; blocked: boolean }[]
      >`SELECT epoch,blocked FROM verification_mail_addresses WHERE recipient=${job.recipient}`;
      if (!address) throw Error('ADDRESS_MISSING');
      if (address.blocked) {
        await tx.$executeRaw`UPDATE verification_outbox SET status='dead',last_failure='address-suppressed',retain_from=clock_timestamp(),retry_digest=NULL,claim_id=NULL,lease_until=NULL WHERE id=${job.id}::uuid`;
        return 'suppressed';
      }
      const token = issueToken();
      const [window] = await tx.$queryRaw<
        { issued_at: Date; expires_at: Date }[]
      >`
      UPDATE public.verification_intents SET token_digest=${tokenDigest(token)}
      WHERE id=${job.intent_id}::uuid AND token_digest=${job.expected_digest}
        AND email=${job.recipient} AND purpose=${job.purpose}
        AND consumed_at IS NULL AND expires_at > clock_timestamp() RETURNING issued_at, expires_at
    `;
      if (!window) {
        await tx.$executeRaw`UPDATE public.verification_outbox SET status='obsolete',
        retain_from=clock_timestamp(), retry_digest=NULL, claim_id=NULL, lease_until=NULL WHERE id=${job.id}::uuid`;
        return 'obsolete';
      }
      await tx.$executeRaw`UPDATE public.verification_outbox SET attempts=attempts+1, retry_digest=NULL WHERE id=${job.id}::uuid`;
      await tx.verificationMailControl.update({
        where: { id: 1 },
        data: { pausedBy: job.id },
      });
      const attemptId = randomUUID();
      await tx.$executeRaw`INSERT INTO verification_mail_attempts(id,outbox_id,intent_id,attempt_no,claim_id,recipient,purpose,provider,provider_scope,address_epoch) VALUES(${attemptId}::uuid,${job.id}::uuid,${job.intent_id}::uuid,${job.attempts + 1},${claim.claim_id}::uuid,${job.recipient},${job.purpose},${delivery.provider ?? 'local'},${delivery.providerScope ?? 'practice'},${address.epoch})`;
      return { job, token, window, attemptId };
    },
    { maxWait: 2000, timeout: 5000 },
  );
}

type Outcome = 'accepted' | ReturnType<typeof classifyMailFailure>;

async function finish(
  database: DatabaseService,
  claim: Claim,
  outcome: Outcome,
  attempt: number,
  digest: string,
  attemptId: string,
  messageId: string | null,
) {
  return database.client.$transaction(async (tx) => {
    const [channel] = await tx.$queryRaw<{ paused_by: string | null }[]>`
      SELECT paused_by FROM public.verification_mail_control WHERE id=1 FOR UPDATE`;
    if (!channel) throw Error('MAIL_CONTROL_MISSING');
    const [fact] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM verification_mail_attempts WHERE id=${attemptId}::uuid AND outbox_id=${claim.id}::uuid AND claim_id=${claim.claim_id}::uuid`;
    if (!fact) throw Error('ATTEMPT_MISSING');
    await tx.$executeRaw`UPDATE verification_mail_attempts SET observed_at=clock_timestamp(),send_outcome=${outcome} WHERE id=${attemptId}::uuid AND observed_at IS NULL`;
    if (messageId) await bindAttemptTx(tx, attemptId, messageId, 'response');
    if (channel.paused_by !== claim.id) return 'lost-after-send';
    // Lock first: a wall-clock predicate evaluated before a lock wait is insufficient.
    await tx.$queryRaw`SELECT id FROM public.verification_outbox WHERE id=${claim.id}::uuid FOR UPDATE`;
    let status: 'accepted' | 'unknown' | 'pending' | 'dead';
    if (outcome === 'accepted') status = 'accepted';
    else if (outcome === 'unconfirmed') status = 'unknown';
    else if (outcome === 'recipient-refused' || attempt >= 3) status = 'dead';
    else status = 'pending';
    const retry = status === 'pending';
    const delaySeconds = retry ? 5 * 2 ** (attempt - 1) + Math.random() * 2 : 0;
    const count = await tx.$executeRaw`UPDATE public.verification_outbox
      SET status=${status}, claim_id=NULL, lease_until=NULL,
        available_at=CASE WHEN ${retry} THEN clock_timestamp() + ${delaySeconds} * interval '1 second' ELSE available_at END,
        retry_digest=${retry ? digest : null}, last_failure=${outcome === 'accepted' ? null : outcome},
        retain_from=CASE WHEN ${status} IN ('accepted','dead') THEN clock_timestamp() ELSE NULL END
      WHERE id=${claim.id}::uuid AND status='attempting'
        AND claim_id=${claim.claim_id}::uuid AND lease_until > clock_timestamp()`;
    if (count !== 1) return 'lost-after-send';
    if (status !== 'unknown') {
      await tx.verificationMailControl.update({
        where: { id: 1 },
        data: { pausedBy: null },
      });
    }
    return retry ? 'retry-scheduled' : status;
  }, mailTransactionOptions);
}

export async function deliverClaim(
  database: DatabaseService,
  delivery: VerificationDelivery,
  claim: Claim,
) {
  const prepared = await prepare(database, claim, delivery);
  if (typeof prepared === 'string') return prepared;
  const { job, token, window, attemptId } = prepared;
  let outcome: Outcome = 'accepted';
  let messageId: string | null = null;
  try {
    const receipt = await delivery.send(
      job.recipient,
      job.purpose,
      token,
      window.issued_at,
      window.expires_at,
      { attemptId },
    );
    if (
      typeof receipt?.providerMessageId !== 'string' ||
      !receipt.providerMessageId ||
      receipt.providerMessageId.length > 200 ||
      (delivery.provider === 'resend' &&
        !providerUuid.test(receipt.providerMessageId))
    )
      throw Error('MAIL_RECEIPT_MISSING');
    messageId = receipt.providerMessageId;
  } catch (error) {
    outcome = classifyMailFailure(error);
  }
  return finish(
    database,
    claim,
    outcome,
    job.attempts + 1,
    tokenDigest(token),
    attemptId,
    messageId,
  );
}

export async function sendOne(
  database: DatabaseService,
  delivery: VerificationDelivery,
  messageId?: string,
) {
  const claim = await claimOne(database, messageId);
  return typeof claim === 'string'
    ? claim
    : deliverClaim(database, delivery, claim);
}
