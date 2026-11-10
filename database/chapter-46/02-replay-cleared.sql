-- VERIFY only. Stop the notification worker first. Replace the UUID with the
-- cleared notification you just verified; commit only if exactly this ID returns.
UPDATE public.notification_jobs j SET status='pending'
FROM public.notifications n
WHERE current_database()='epp_ch46_verify' AND j.id='REPLACE_WITH_CLEARED_NOTIFICATION_UUID'::uuid
  AND n.id=j.id AND n.user_id=j.user_id AND n.kind=j.kind
  AND n.cleared_at IS NOT NULL AND j.status='done'
RETURNING j.id,j.status,n.read_at,n.cleared_at;
