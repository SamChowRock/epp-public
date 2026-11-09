import { randomUUID } from 'node:crypto';
import type { DatabaseService } from './database.service.js';
import type { Prisma } from './generated/prisma/client.js';

export type Claim = { id: string; claim_id: string };
type Tx = Prisma.TransactionClient;

// The first read avoids claiming work behind a stopped channel. Preparation checks
// again under the singleton lock. A busy live sender is not a persistent incident.
export async function channelState(tx: Tx, lock: boolean) {
  if (lock) await tx.$queryRaw`SELECT id FROM public.verification_mail_control WHERE id=1 FOR UPDATE`;
  const [row] = await tx.$queryRaw<{ state: 'open' | 'busy' | 'paused' }[]>`
    SELECT CASE WHEN c.paused_by IS NULL THEN 'open'
      WHEN o.status='attempting' AND o.lease_until > clock_timestamp() THEN 'busy'
      ELSE 'paused' END AS state
    FROM public.verification_mail_control c
    LEFT JOIN public.verification_outbox o ON o.id=c.paused_by WHERE c.id=1
  `;
  if (!row) throw Error('MAIL_CONTROL_MISSING');
  return row.state;
}

export async function claimOne(database: DatabaseService, messageId?: string) {
  return database.client.$transaction(async tx => {
    const state = await channelState(tx, false);
    if (state !== 'open') return state;
    const token = randomUUID();
    const [job] = await tx.$queryRaw<Claim[]>`
      WITH pick AS (
        SELECT id FROM public.verification_outbox
        WHERE status='pending' AND COALESCE(lease_until, available_at) <= statement_timestamp()
          AND (${messageId ?? null}::uuid IS NULL OR id=${messageId ?? null}::uuid)
        ORDER BY COALESCE(lease_until, available_at), id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE public.verification_outbox o SET claim_id=${token}::uuid,
        lease_until=clock_timestamp()+interval '30 seconds'
      FROM pick WHERE o.id=pick.id RETURNING o.id, o.claim_id
    `;
    return job ?? 'empty';
  });
}
