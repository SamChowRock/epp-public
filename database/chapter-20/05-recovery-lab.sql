-- Run ONLY against a disposable epp_ch20_recovery database (see README).
-- Editor A: first verify the database, then start this transaction.
SELECT current_database(),current_user,pg_backend_pid();
BEGIN;
SET LOCAL idle_in_transaction_session_timeout='60s';
SELECT id FROM public.captures LIMIT 1;
-- Keep this transaction open while the separate migration process runs.
-- ACCESS SHARE is held until the transaction ends, even after SELECT finishes.
-- After observing the failed migration, run this in THE SAME editor:
ROLLBACK;

-- Editor B: inspect before resolving; chinese_intent must be absent after rollback.
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='captures' ORDER BY ordinal_position;
SELECT migration_name,started_at,finished_at,rolled_back_at,left(logs,400) AS failure_detail
FROM public._prisma_migrations ORDER BY started_at;
-- logs may be empty; correlate the first error in PostgreSQL server logs if needed.
