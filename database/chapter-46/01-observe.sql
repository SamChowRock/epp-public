-- Before and after upgrading the VERIFY copy. Record the actual IDs before comparing.
SELECT current_database(), to_regclass('public.notification_jobs'), to_regclass('public.notifications');
SELECT id, status, web_enabled FROM public.users ORDER BY id;
SELECT id,status,attempts,available_at FROM public.verification_outbox ORDER BY id;
SELECT paused_by FROM public.verification_mail_control WHERE id=1;

-- After upgrading. Filter by the job or user ID in a shared exercise database.
SELECT j.kind,j.status AS job,n.id IS NOT NULL AS materialized,
       n.read_at IS NOT NULL AS has_read,n.cleared_at IS NOT NULL AS cleared,
       j.id AS event_id,j.user_id AS recipient,j.expires_at
FROM public.notification_jobs j LEFT JOIN public.notifications n ON n.id=j.id
ORDER BY j.created_at,j.id;
