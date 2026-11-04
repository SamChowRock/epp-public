-- Isolated practice DB only. Run numbered blocks in two DIFFERENT backend PIDs.
-- Setup in an idle auto-commit connection, once.
CREATE SCHEMA chapter25_lab;
CREATE TABLE chapter25_lab.decision (id integer PRIMARY KEY, status text NOT NULL);
CREATE TABLE chapter25_lab.result (id integer PRIMARY KEY, candidate_id integer NOT NULL);
INSERT INTO chapter25_lab.decision VALUES (1,'pending'),(2,'pending');
-- A1
BEGIN;
SELECT * FROM chapter25_lab.decision WHERE id=1;
-- B1: also reads pending
BEGIN;
SELECT * FROM chapter25_lab.decision WHERE id=1;
-- A2
UPDATE chapter25_lab.decision SET status='accepted' WHERE id=1;
INSERT INTO chapter25_lab.result VALUES (101,1);
COMMIT;
-- B2: decision based on its earlier read; unconditional write still succeeds
UPDATE chapter25_lab.decision SET status='accepted' WHERE id=1;
INSERT INTO chapter25_lab.result VALUES (102,1);
COMMIT;
SELECT candidate_id,count(*) FROM chapter25_lab.result GROUP BY candidate_id;
-- Guarded alternative on the untouched row 2, no result insertion if RETURNING is empty.
-- A3
BEGIN;
UPDATE chapter25_lab.decision SET status='accepted' WHERE id=2 AND status='pending' RETURNING *;
-- B3: waits until A ends
BEGIN;
UPDATE chapter25_lab.decision SET status='discarded' WHERE id=2 AND status='pending' RETURNING *;
-- A4
COMMIT;
-- B4: its blocked UPDATE completes with zero rows, then end the transaction.
ROLLBACK;
SELECT * FROM chapter25_lab.decision ORDER BY id;
