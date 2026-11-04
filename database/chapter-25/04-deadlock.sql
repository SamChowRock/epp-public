-- Requires 02-races setup. A and B must have different PIDs.
-- A1
BEGIN;
SET LOCAL statement_timeout='10s';
SELECT id FROM chapter25_lab.decision WHERE id=1 FOR UPDATE;
-- B1
BEGIN;
SET LOCAL statement_timeout='10s';
SELECT id FROM chapter25_lab.decision WHERE id=2 FOR UPDATE;
-- A2: waits. Do not wait for this query to finish before starting B2.
SELECT id FROM chapter25_lab.decision WHERE id=2 FOR UPDATE;
-- B2: closes the cycle. Either A or B may get 40P01.
SELECT id FROM chapter25_lab.decision WHERE id=1 FOR UPDATE;
-- BOTH editors: rollback, including the transaction that was not selected as victim.
ROLLBACK;
-- Correct acquisition order for multiple existing rows: ascending stable ID in every path.
BEGIN;
SELECT id FROM chapter25_lab.decision WHERE id IN (1,2) ORDER BY id FOR UPDATE;
ROLLBACK;
