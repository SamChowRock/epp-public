-- A1: independent connection A, same isolated database as the API.
-- Replace the operation UUID, keeping the JSON array exactly as the application formats it.
BEGIN;
SET LOCAL idle_in_transaction_session_timeout='60s';
SELECT pg_backend_pid();
SELECT pg_advisory_xact_lock(hashtextextended(
  '["command","10000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000000"]',0));
-- B: Postman sends the matching operation. Expect 503 without a new receipt.
-- A2: release only this experiment's transaction.
ROLLBACK;
-- B: resend the same operation and candidate; expect 201 or the previously committed 201.
