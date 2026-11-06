-- VERIFY only. Run selected blocks in three independent connections A, L, O.
-- Each round starts with B active/true, committed via 03-grant-web.sql.
-- First run in A and L; save their two DIFFERENT PIDs before starting transactions.
SELECT pg_backend_pid();

-- Round 1, A: change eligibility but keep the transaction open.
BEGIN;
SET LOCAL idle_in_transaction_session_timeout = '60s';
SET LOCAL lock_timeout = '30s';
UPDATE public.users SET web_enabled = false
WHERE id = '20000000-0000-4000-8000-000000000002'
RETURNING id, status, web_enabled;
-- Do not COMMIT yet.

-- Round 1, L: wait for the same user row.
BEGIN;
SET LOCAL idle_in_transaction_session_timeout = '60s';
SET LOCAL lock_timeout = '30s';
SELECT status, web_enabled FROM public.users
WHERE id = '20000000-0000-4000-8000-000000000002' FOR UPDATE;

-- O: replace the two 0 values with A/L PIDs; no query text or secrets displayed.
SELECT pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocked_by
FROM pg_stat_activity WHERE pid IN (0, 0) ORDER BY pid;

-- After O sees L waiting on A: in A, execute COMMIT;
-- L then reads active/false. In L, execute ROLLBACK;
-- In A, restore B with 03-grant-web.sql and COMMIT before the second round.

-- Round 2: run the L block first: active/true, keeping its row lock.
-- Then run the A block: UPDATE waits. O should show A blocked by L.
-- In L execute ROLLBACK to release; A's UPDATE returns active/false.
-- In A execute COMMIT. Restore B using 03 and COMMIT if continuing the chapter.
-- On timeout/error: ROLLBACK in BOTH A and L, reconnect if the idle timeout
-- closed a connection, then query current state before restarting the round.
-- This lab models only the user-row lock. It does not create a session or
-- change a password. HTTP keeps its normal 1s lock timeout and 5s transaction timeout.
