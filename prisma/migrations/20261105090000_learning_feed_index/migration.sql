BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE INDEX learning_records_user_feed_idx ON public.learning_records
  (user_id, created_at DESC, id DESC);
COMMIT;
