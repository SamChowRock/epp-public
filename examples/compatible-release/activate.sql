\set ON_ERROR_STOP on
SELECT current_database() = :'expected_db' AS right_db \gset
\if :right_db
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.capture_revisions ENABLE TRIGGER new_revision_intent_required;
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'Wrong release database'; END $$;
\endif
