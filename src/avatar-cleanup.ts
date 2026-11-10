import type pg from 'pg';
import type { AvatarObjects } from './avatar-objects.js';

// Use an autocommit connection. Eligibility must be revoked durably before DELETE.
export async function cleanAvatarBatch(client: pg.Client | pg.PoolClient, objects: AvatarObjects, attemptId?: string) {
  const due = await client.query<{ id: string }>(`WITH due AS (
    SELECT w.id FROM public.avatar_writes w WHERE w.state IN ('writing','retired')
      AND ($1::uuid IS NULL OR w.id=$1::uuid)
      AND w.check_after<=clock_timestamp()
      AND NOT EXISTS (SELECT FROM public.users u WHERE u.id=w.user_id AND u.avatar_id=w.id)
    ORDER BY w.check_after,w.id LIMIT 20 FOR UPDATE OF w SKIP LOCKED
  ) UPDATE public.avatar_writes w SET state='retired',check_after=clock_timestamp()+interval '5 minutes'
    FROM due WHERE w.id=due.id RETURNING w.id`, [attemptId ?? null]);
  let deleted = 0;
  let failed = 0;
  for (const { id } of due.rows) {
    try { await objects.remove(id); }
    catch { failed++; continue; }
    // A lost PUT may arrive after DELETE, even after a previous successful pass.
    await client.query(`UPDATE public.avatar_writes SET check_after=clock_timestamp()+interval '1 day'
      WHERE id=$1 AND state='retired'`, [id]);
    deleted++;
  }
  return { deleted, failed };
}
