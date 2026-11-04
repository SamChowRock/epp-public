-- Run one numbered block at a time in ONE editor connection, Auto-commit on.
-- 1. Setup disposable, session-local tables; run each statement separately.
CREATE TEMP TABLE acceptance_lab (id integer PRIMARY KEY, status text NOT NULL);
CREATE TEMP TABLE expression_lab (id integer PRIMARY KEY, meaning text NOT NULL);
INSERT INTO acceptance_lab VALUES (1, 'pending');
-- 2. Each statement is separately committed. The second one intentionally fails (23502).
UPDATE acceptance_lab SET status='accepted' WHERE id=1;
INSERT INTO expression_lab VALUES (1, NULL);
-- 3. No open transaction exists to undo the first statement.
SELECT a.id, a.status, count(e.id) AS expressions FROM acceptance_lab a
LEFT JOIN expression_lab e ON e.id=a.id GROUP BY a.id,a.status;
-- 4. Restore only this disposable row before the transaction experiment.
UPDATE acceptance_lab SET status='pending' WHERE id=1;
-- 5. Run BEGIN and UPDATE, then the failing INSERT separately.
BEGIN;
UPDATE acceptance_lab SET status='accepted' WHERE id=1;
INSERT INTO expression_lab VALUES (1, NULL);
-- 6. A SELECT now reports 25P02. Run ROLLBACK separately, then inspect.
ROLLBACK;
SELECT a.id, a.status, count(e.id) AS expressions FROM acceptance_lab a
LEFT JOIN expression_lab e ON e.id=a.id GROUP BY a.id,a.status;
-- 7. Successful unit; COMMIT ends it.
BEGIN;
UPDATE acceptance_lab SET status='accepted' WHERE id=1;
INSERT INTO expression_lab VALUES (1, '我不太会做饭。');
COMMIT;
SELECT a.id, a.status, count(e.id) AS expressions FROM acceptance_lab a
LEFT JOIN expression_lab e ON e.id=a.id GROUP BY a.id,a.status;
-- Closing this editor connection removes the temporary tables.
