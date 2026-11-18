import { Prisma } from './generated/prisma/client.js';

// The same transaction snapshot must cover completeness and the actual result page.
export async function captureListComplete(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const [row] = await tx.$queryRaw<{ complete: boolean }[]>`
    SELECT NOT EXISTS (
      SELECT FROM public.captures c WHERE c.user_id = ${userId}::uuid AND (
        NOT EXISTS (SELECT FROM public.capture_revisions r WHERE r.capture_id = c.id)
        OR EXISTS (SELECT FROM public.capture_integrity_cases q WHERE q.capture_id = c.id AND q.state = 'quarantined')
      )
    ) AS complete`;
  return row?.complete === true;
}
