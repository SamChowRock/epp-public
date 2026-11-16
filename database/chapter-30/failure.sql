-- Isolated VERIFY database only. Pause other writers while observing counts.
-- Execute each block separately, never the whole file at once.
-- Replace this user and key in the constraint AND saved Postman requests.
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.capture_write_receipts
ADD CONSTRAINT ch30_reject_one_write
CHECK (user_id <> '10000000-0000-4000-8000-000000000001'::uuid
  OR operation_id <> '30000000-0000-4000-8000-000000000099'::uuid) NOT VALID;
COMMIT;

-- Send keyed create/append, then compare business counts with your baseline.
-- Both should fail; no business increment or matching receipt remains.
-- If interrupted, inspect this constraint before resuming:
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.capture_write_receipts'::regclass
  AND conname = 'ch30_reject_one_write';

-- Execute separately, only after inspecting the failed requests:
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.capture_write_receipts DROP CONSTRAINT ch30_reject_one_write;
COMMIT;
-- Retry each original key and original request; success can now commit atomically.
-- If a DDL block times out, ROLLBACK before addressing the lock and retrying it.
