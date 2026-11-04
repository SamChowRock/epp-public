-- Requires 02-races setup. A/B different connections. All writes are rolled back.
-- A
BEGIN;
SELECT * FROM chapter25_lab.decision WHERE id=1 FOR UPDATE;
-- B: plain SELECT sees committed data and does not wait for A's row lock.
SELECT * FROM chapter25_lab.decision WHERE id=1;
BEGIN;
SET LOCAL lock_timeout='1s';
UPDATE chapter25_lab.decision SET status='pending' WHERE id=1;
-- B: 55P03, then ROLLBACK is required.
ROLLBACK;
-- B: NOWAIT refuses immediately; failure still aborts its transaction.
BEGIN;
SELECT * FROM chapter25_lab.decision WHERE id=1 FOR UPDATE NOWAIT;
ROLLBACK;
-- B: SKIP LOCKED returns no row, which does NOT mean the row does not exist.
BEGIN;
SELECT * FROM chapter25_lab.decision WHERE id=1 FOR UPDATE SKIP LOCKED;
ROLLBACK;
-- B: start a new bounded wait for the observer; A still holds the original lock.
BEGIN;
SET LOCAL lock_timeout='30s';
UPDATE chapter25_lab.decision SET status='pending' WHERE id=1;
-- C: while B is blocked, an idle THIRD connection inspects safe metadata only.
SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blocked_by
FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid;
-- A: release before the 30-second observation window ends.
ROLLBACK;
-- B: its UPDATE finishes, then undo the experiment change.
ROLLBACK;
-- Empty result cannot lock a future row.
BEGIN;
SELECT * FROM chapter25_lab.decision WHERE id=99 FOR UPDATE;
ROLLBACK;
