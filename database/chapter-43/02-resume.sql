-- Run the SELECT first. After restoring SMTP, enter this incident's message ID
-- and the independently expected verification database name in the UPDATE.
SELECT current_database(), c.paused_by AS blocking_message, o.status
FROM public.verification_mail_control c
LEFT JOIN public.verification_outbox o ON o.id = c.paused_by
WHERE c.id = 1;

UPDATE public.verification_mail_control
SET paused_by = NULL
WHERE id = 1 AND current_database() = 'epp_ch43_verify'
  AND paused_by = 'REPLACE_WITH_REVIEWED_MESSAGE_UUID'::uuid
RETURNING id;
