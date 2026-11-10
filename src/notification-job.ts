import type { DatabaseService } from './database.service.js';

export function createOneNotification(database: DatabaseService) {
  return database.client.$transaction(async tx => {
    const [job] = await tx.$queryRaw<{ id: string; user_id: string; kind: string }[]>`SELECT id,user_id,kind
      FROM public.notification_jobs WHERE status='pending' AND action='notification.create'
      ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!job) return 'empty';
    const existing = await tx.notification.findUnique({ where: { id: job.id }, select: { userId: true, kind: true } });
    if (existing && (existing.userId !== job.user_id || existing.kind !== job.kind)) {
      throw new Error('NOTIFICATION_EVENT_MISMATCH');
    }
    if (!existing) {
      // A non-key change such as disabling an account must conflict with this lock.
      const [user] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM public.users
        WHERE id=${job.user_id}::uuid FOR SHARE`;
      const [fresh] = await tx.$queryRaw<{ valid: boolean }[]>`SELECT expires_at > clock_timestamp() AS valid
        FROM public.notification_jobs WHERE id=${job.id}::uuid`;
      if (user?.status !== 'active' || !fresh?.valid) {
        await tx.notificationJob.update({ where: { id: job.id }, data: { status: 'obsolete' } });
        return 'notification-obsolete';
      }
      await tx.$executeRaw`INSERT INTO public.notifications(id,user_id,kind,created_at)
        SELECT id,user_id,kind,clock_timestamp() FROM public.notification_jobs WHERE id=${job.id}::uuid`;
    }
    await tx.notificationJob.update({ where: { id: job.id }, data: { status: 'done' } });
    return 'notification-done';
  }, { maxWait: 2000, timeout: 5000 });
}
