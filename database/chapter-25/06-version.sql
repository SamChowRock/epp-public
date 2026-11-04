-- After 02-races setup. Version comparison is independent of a status state machine.
CREATE TABLE chapter25_lab.note (id integer PRIMARY KEY, text text NOT NULL, version integer NOT NULL);
INSERT INTO chapter25_lab.note VALUES (1,'first',3);
-- A and B each read version=3 before either writes.
SELECT * FROM chapter25_lab.note WHERE id=1;
-- A
UPDATE chapter25_lab.note SET text='A edit',version=version+1 WHERE id=1 AND version=3 RETURNING *;
-- B: zero rows, do not silently retry as version=4.
UPDATE chapter25_lab.note SET text='B edit',version=version+1 WHERE id=1 AND version=3 RETURNING *;
-- ABA: value changes back but the version keeps moving.
UPDATE chapter25_lab.note SET text='first',version=version+1 WHERE id=1 RETURNING *;
-- Cleanup only after all experiment transactions have ended.
DROP TABLE chapter25_lab.note;
DROP TABLE chapter25_lab.result;
DROP TABLE chapter25_lab.decision;
DROP SCHEMA chapter25_lab;
