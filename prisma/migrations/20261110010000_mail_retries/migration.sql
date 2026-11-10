BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.verification_outbox
  DROP CONSTRAINT verification_outbox_status_check,
  ADD CONSTRAINT verification_outbox_status_check CHECK
    (status IN ('pending','attempting','accepted','unknown','obsolete','dead')),
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  ADD COLUMN retry_digest text CHECK (retry_digest ~ '^[0-9a-f]{64}$'),
  ADD COLUMN last_failure text CHECK (last_failure IN
    ('connect-refused','recipient-deferred','recipient-refused','unconfirmed')),
  ADD COLUMN retain_from timestamptz(3);
-- The exact completion time of a historical row is unknown.
UPDATE public.verification_outbox SET retain_from=statement_timestamp()
WHERE status IN ('accepted','obsolete');
CREATE INDEX verification_outbox_retention_idx ON public.verification_outbox(retain_from,id)
  WHERE retain_from IS NOT NULL;
COMMIT;
