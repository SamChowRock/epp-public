-- Before AND after migration; save/export these results in your VERIFY database.
SELECT current_database();
SELECT id, recipient, purpose, status, available_at FROM public.verification_outbox ORDER BY id;
SELECT id, paused_by FROM public.verification_mail_control WHERE id=1;

-- After migration. Do not select generation, the verification token or its digest.
SELECT id, recipient, purpose, available_at, status, (claim_id IS NOT NULL) AS reserved, lease_until,
       clock_timestamp() AS observed_at
FROM public.verification_outbox ORDER BY available_at, id;

SELECT count(*) AS due, min(available_at) AS oldest_due_since
FROM public.verification_outbox
WHERE status='pending' AND COALESCE(lease_until,available_at) <= statement_timestamp();

SELECT indexdef FROM pg_indexes WHERE schemaname='public'
  AND indexname='verification_outbox_pick_idx';

-- 44.4, after migration. Replace the fictional recipients if you used other addresses.
-- Use the full timestamps above to check expiry; this short display is for comparing rows.
SELECT split_part(o.recipient, '@', 1) AS mail, o.status,
       o.claim_id IS NOT NULL AS reserved,
       to_char(o.lease_until, 'HH24:MI:SS') AS lease_until,
       CASE WHEN c.paused_by IS NULL THEN 'free'
            WHEN c.paused_by = o.id THEN 'this message' ELSE 'occupied' END AS channel
FROM public.verification_outbox o CROSS JOIN public.verification_mail_control c
WHERE c.id = 1 AND o.recipient IN ('before44@example.test', 'after44@example.test')
ORDER BY o.available_at, o.id;
