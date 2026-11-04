-- One editor connection; run the numbered blocks separately.
CREATE TEMP TABLE import_lab (id integer PRIMARY KEY, text text NOT NULL);
-- 1
BEGIN;
INSERT INTO import_lab VALUES (1,'first');
SAVEPOINT optional_row;
-- 2: expected 23502
INSERT INTO import_lab VALUES (2,NULL);
-- 3: recover to the savepoint, preserving row 1 inside this transaction
ROLLBACK TO SAVEPOINT optional_row;
INSERT INTO import_lab VALUES (3,'third');
RELEASE SAVEPOINT optional_row;
SELECT * FROM import_lab ORDER BY id;
-- 4: RELEASE was not COMMIT. Outer rollback removes both rows.
ROLLBACK;
SELECT count(*) FROM import_lab;
