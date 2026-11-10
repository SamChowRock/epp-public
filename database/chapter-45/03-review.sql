-- Stop all senders, including watchers. Save the evidence and disposition first.
-- Leave the historical outcome unchanged. Both placeholders must match this incident.
UPDATE public.verification_mail_control c SET paused_by=NULL
FROM public.verification_outbox o
WHERE current_database()='epp_ch45_verify' AND c.id=1 AND c.paused_by=o.id
  AND o.id='REPLACE_WITH_REVIEWED_MESSAGE_UUID'::uuid
  AND o.status IN ('unknown','attempting')
RETURNING o.id,o.status;
