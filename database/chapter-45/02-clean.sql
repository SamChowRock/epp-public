-- One batch. Inspect the returned IDs before COMMIT when using manual transactions.
WITH batch AS (
  SELECT id FROM public.verification_outbox
  WHERE current_database()='epp_ch45_verify' AND status IN ('accepted','obsolete','dead')
    AND retain_from < statement_timestamp() - interval '30 days'
    AND NOT EXISTS (SELECT FROM public.verification_mail_control WHERE paused_by=verification_outbox.id)
  ORDER BY retain_from,id LIMIT 100 FOR UPDATE SKIP LOCKED
)
DELETE FROM public.verification_outbox o USING batch WHERE o.id=batch.id
RETURNING o.id,o.status;
