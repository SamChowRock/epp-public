-- psql only. Stop every sender first; independently review the exact unknown
-- incident and save its evidence. This does NOT resend or rewrite its status.
\set ON_ERROR_STOP on
SELECT current_database() = :'expected_db' AS target_ok \gset
\if :target_ok
BEGIN;
SELECT id FROM verification_mail_control WHERE id=1 FOR UPDATE;
UPDATE verification_mail_control c SET paused_by=NULL
FROM verification_outbox o
WHERE c.id=1 AND c.paused_by=o.id AND o.id=:'incident_id'::uuid
  AND o.status IN ('unknown','attempting')
RETURNING o.id,o.status;
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'DATABASE_MISMATCH'; END $$;
\endif
