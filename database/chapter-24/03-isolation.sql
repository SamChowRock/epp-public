-- Use an isolated practice database. A and B must have DIFFERENT pg_backend_pid().
-- Observer/setup connection, auto-commit: create once, no business tables touched.
CREATE SCHEMA chapter24_lab;
CREATE TABLE chapter24_lab.counter (id integer PRIMARY KEY, value integer NOT NULL);
INSERT INTO chapter24_lab.counter VALUES (1,10);
-- A1
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT pg_backend_pid() AS pid, pg_current_xact_id() AS tx, value
FROM chapter24_lab.counter WHERE id=1;
-- B1, in B with auto-commit, then return to A.
UPDATE chapter24_lab.counter SET value=20 WHERE id=1;
-- A2: 20, although A1 was 10.
SELECT pg_backend_pid() AS pid, pg_current_xact_id() AS tx, value
FROM chapter24_lab.counter WHERE id=1;
ROLLBACK;
-- B2: reset the lab row, outside a transaction.
UPDATE chapter24_lab.counter SET value=10 WHERE id=1;
-- A3
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT pg_backend_pid() AS pid, pg_current_xact_id() AS tx, value
FROM chapter24_lab.counter WHERE id=1;
-- B3
UPDATE chapter24_lab.counter SET value=20 WHERE id=1;
-- A4: still 10. Then the attempted update fails with 40001.
SELECT pg_backend_pid() AS pid, pg_current_xact_id() AS tx, value
FROM chapter24_lab.counter WHERE id=1;
UPDATE chapter24_lab.counter SET value=value+1 WHERE id=1;
ROLLBACK;
-- A5: a new transaction sees 20.
SELECT value FROM chapter24_lab.counter WHERE id=1;
-- Once both A and B have ended their transactions, setup connection only:
DROP TABLE chapter24_lab.counter;
DROP SCHEMA chapter24_lab;
