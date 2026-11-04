BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE public.learning_records
  ADD CONSTRAINT learning_records_candidate_id_key UNIQUE (candidate_id);
COMMIT;
