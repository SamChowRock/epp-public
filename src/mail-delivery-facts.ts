import { randomUUID } from 'node:crypto';
import type { DatabaseService } from './database.service.js';
import type { Prisma } from './generated/prisma/client.js';
export type MailTx = Prisma.TransactionClient;
export const mailTransactionOptions = { maxWait: 2000, timeout: 5000 };
export class ReceiptError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export async function lockMailChannel(tx: MailTx) {
  const rows =
    await tx.$queryRaw`SELECT id FROM verification_mail_control WHERE id=1 FOR UPDATE`;
  if (!Array.isArray(rows) || rows.length !== 1)
    throw Error('MAIL_CONTROL_MISSING');
}
export async function mailTransaction<T>(
  db: DatabaseService,
  work: (tx: MailTx) => Promise<T>,
): Promise<T> {
  return db.client.$transaction(async (tx) => {
    await lockMailChannel(tx);
    return work(tx);
  }, mailTransactionOptions);
}
export type Attempt = {
  id: string;
  recipient: string;
  address_epoch: bigint;
  provider: string;
  provider_scope: string;
  provider_message_id: string | null;
};
export type MailEvent = {
  eventId: string;
  bodySha256: string;
  eventType: string;
  providerMessageId: string;
  recipient: string | null;
  occurredAt: Date;
  messageId: string | null;
  bounceType: string | null;
  bounceSubtype: string | null;
};
const supported = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
]);
async function associate(tx: MailTx, attempt: Attempt) {
  const events = await tx.$queryRaw<
    {
      id: string;
      recipient: string | null;
      event_type: string;
      bounce_type: string | null;
    }[]
  >`SELECT id,recipient,event_type,bounce_type FROM verification_mail_events WHERE provider=${attempt.provider} AND provider_scope=${attempt.provider_scope} AND provider_message_id=${attempt.provider_message_id} AND match_state='unmatched' ORDER BY received_at,id LIMIT 100`;
  for (const e of events) {
    const matches = e.recipient === attempt.recipient;
    let effect = 'none';
    if (
      matches &&
      (e.event_type === 'email.complained' ||
        (e.event_type === 'email.bounced' && e.bounce_type === 'Permanent'))
    ) {
      const [address] = await tx.$queryRaw<
        {
          epoch: bigint;
        }[]
      >`SELECT epoch FROM verification_mail_addresses WHERE recipient=${attempt.recipient}`;
      if (!address) throw Error('ADDRESS_MISSING');
      if (address.epoch !== attempt.address_epoch) effect = 'historical';
      else {
        effect = 'suppressed';
        await tx.$executeRaw`UPDATE verification_mail_addresses SET blocked=true,blocked_event_id=${e.id}::uuid,updated_at=clock_timestamp() WHERE recipient=${attempt.recipient}`;
      }
    }
    await tx.$executeRaw`UPDATE verification_mail_events SET attempt_id=${attempt.id}::uuid,match_state=${matches ? 'matched' : 'recipient-mismatch'},effect=${effect} WHERE id=${e.id}::uuid`;
  }
}
export async function recordMailEvent(
  db: DatabaseService,
  scope: string,
  endpoint: string,
  event: MailEvent,
) {
  return mailTransaction(db, async (tx) => {
    const [old] = await tx.$queryRaw<
      {
        body_sha256: string;
      }[]
    >`SELECT body_sha256 FROM verification_mail_events WHERE provider='resend' AND provider_scope=${scope} AND endpoint_scope=${endpoint} AND event_id=${event.eventId}`;
    if (old) {
      if (old.body_sha256 !== event.bodySha256)
        throw new ReceiptError(409, 'EVENT_CONFLICT');
      return 'duplicate';
    }
    const [count] = await tx.$queryRaw<
      {
        n: bigint;
      }[]
    >`SELECT count(*) AS n FROM verification_mail_events WHERE provider='resend' AND provider_scope=${scope} AND provider_message_id=${event.providerMessageId}`;
    if (Number(count?.n) >= 100) throw new ReceiptError(503, 'EVENT_CAPACITY');
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO verification_mail_events(id,provider,provider_scope,endpoint_scope,event_id,body_sha256,event_type,provider_message_id,recipient,provider_occurred_at,message_id,bounce_type,bounce_subtype,match_state) VALUES(${id}::uuid,'resend',${scope},${endpoint},${event.eventId},${event.bodySha256},${event.eventType},${event.providerMessageId},${event.recipient},${event.occurredAt},${event.messageId},${event.bounceType},${event.bounceSubtype},${supported.has(event.eventType) ? 'unmatched' : 'unsupported'})`;
    const [attempt] = await tx.$queryRaw<
      Attempt[]
    >`SELECT * FROM verification_mail_attempts WHERE provider='resend' AND provider_scope=${scope} AND provider_message_id=${event.providerMessageId}`;
    if (attempt) await associate(tx, attempt);
    return 'recorded';
  });
}
export async function bindAttemptTx(
  tx: MailTx,
  attemptId: string,
  messageId: string,
  source: 'response' | 'manual',
  audit?: {
    actor: string;
    reason: string;
    evidenceRef: string;
  },
) {
  const [a] = await tx.$queryRaw<
    Attempt[]
  >`SELECT * FROM verification_mail_attempts WHERE id=${attemptId}::uuid`;
  if (!a) throw new ReceiptError(409, 'ATTEMPT_MISSING');
  if (a.provider_message_id !== null) {
    if (a.provider_message_id !== messageId)
      throw new ReceiptError(409, 'BINDING_CONFLICT');
    if (source === 'manual') throw new ReceiptError(409, 'ALREADY_BOUND');
  } else
    await tx.$executeRaw`UPDATE verification_mail_attempts SET provider_message_id=${messageId},provider_bound_at=clock_timestamp(),binding_source=${source},binding_actor=${audit?.actor ?? null},binding_reason=${audit?.reason ?? null},binding_evidence_ref=${audit?.evidenceRef ?? null} WHERE id=${attemptId}::uuid`;
  await associate(tx, { ...a, provider_message_id: messageId });
}
export async function bindAttempt(
  db: DatabaseService,
  input: {
    attemptId: string;
    providerScope: string;
    providerMessageId: string;
    actor: string;
    reason: string;
    evidenceRef: string;
  },
) {
  return mailTransaction(db, async (tx) => {
    const [a] = await tx.$queryRaw<
      Attempt[]
    >`SELECT * FROM verification_mail_attempts WHERE id=${input.attemptId}::uuid`;
    if (a?.provider !== 'resend' || a.provider_scope !== input.providerScope)
      throw new ReceiptError(409, 'BINDING_SCOPE');
    await bindAttemptTx(
      tx,
      input.attemptId,
      input.providerMessageId,
      'manual',
      input,
    );
    return { id: input.attemptId, result: 'bound' };
  });
}
export async function releaseAddress(
  db: DatabaseService,
  input: {
    id: string;
    recipient: string;
    expectedEpoch: string;
    actor: string;
    reason: string;
  },
) {
  return mailTransaction(db, async (tx) => {
    const [old] = await tx.$queryRaw<
      {
        recipient: string;
        old_epoch: bigint;
        new_epoch: bigint;
        actor: string;
        reason: string;
      }[]
    >`SELECT * FROM verification_mail_releases WHERE id=${input.id}::uuid`;
    if (old) {
      if (
        old.recipient !== input.recipient ||
        String(old.old_epoch) !== input.expectedEpoch ||
        old.actor !== input.actor ||
        old.reason !== input.reason
      )
        throw new ReceiptError(409, 'RELEASE_CONFLICT');
      return {
        id: input.id,
        epoch: String(old.new_epoch),
        result: 'duplicate',
      };
    }
    const [a] = await tx.$queryRaw<
      {
        epoch: bigint;
        blocked_event_id: string | null;
      }[]
    >`SELECT * FROM verification_mail_addresses WHERE recipient=${input.recipient}`;
    if (!a || String(a.epoch) !== input.expectedEpoch)
      throw new ReceiptError(409, 'EPOCH_CONFLICT');
    await tx.$executeRaw`INSERT INTO verification_mail_releases(id,recipient,old_epoch,new_epoch,previous_blocked_event_id,actor,reason) VALUES(${input.id}::uuid,${input.recipient},${a.epoch},${a.epoch + 1n},${a.blocked_event_id}::uuid,${input.actor},${input.reason})`;
    await tx.$executeRaw`UPDATE verification_mail_addresses SET epoch=epoch+1,blocked=false,blocked_event_id=NULL,updated_at=clock_timestamp() WHERE recipient=${input.recipient}`;
    return { id: input.id, epoch: String(a.epoch + 1n), result: 'released' };
  });
}
