-- Preview the retention scope. This never deletes verified contacts or users.
SELECT count(*) AS eligible
FROM public.verification_intents
WHERE expires_at < clock_timestamp() - interval '24 hours';
-- After confirming the target database and policy, delete at most 1000 old intents per run.
WITH batch AS (
  SELECT id FROM public.verification_intents
  WHERE expires_at < clock_timestamp() - interval '24 hours'
  ORDER BY expires_at, id LIMIT 1000 FOR UPDATE SKIP LOCKED
)
DELETE FROM public.verification_intents i USING batch b WHERE i.id = b.id
RETURNING i.id;
