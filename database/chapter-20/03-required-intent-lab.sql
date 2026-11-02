-- DEV connection, one editor/session throughout. Temporary table only.
-- Run each numbered stage separately; intentional errors must be followed by ROLLBACK.
SELECT current_database(), current_user, pg_backend_pid();
CREATE TEMP TABLE intent_lab (id integer PRIMARY KEY, chinese_intent text);
INSERT INTO intent_lab VALUES (1,NULL),(2,'用户已确认的意图');

-- 1. Existing NULL prevents direct tightening: expected 23502.
BEGIN;
ALTER TABLE intent_lab ALTER COLUMN chinese_intent SET NOT NULL;
ROLLBACK;

-- 2. Gate NEW/UPDATED rows without scanning historical rows.
BEGIN;
SET LOCAL lock_timeout='2s';
ALTER TABLE intent_lab ADD CONSTRAINT intent_lab_present
  CHECK (chinese_intent IS NOT NULL) NOT VALID;
COMMIT;
SELECT conname,convalidated,pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid='pg_temp.intent_lab'::regclass;

-- Expected 23514. The gate is active even though convalidated=false.
BEGIN;
INSERT INTO intent_lab VALUES (3,NULL);
ROLLBACK;

-- 3. Replace only the missing value with an explicitly supplied, reviewed value.
-- In real data, keep provenance and do not invent intent from the English original.
UPDATE intent_lab SET chinese_intent='这条实验记录经确认后补充的意图'
WHERE id=1 AND chinese_intent IS NULL RETURNING *;
SELECT count(*) AS remaining FROM intent_lab WHERE chinese_intent IS NULL;

-- 4. Validate existing rows, then use the proof to avoid another full-table scan.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
ALTER TABLE intent_lab VALIDATE CONSTRAINT intent_lab_present;
COMMIT;
BEGIN;
SET LOCAL lock_timeout='2s';
ALTER TABLE intent_lab ALTER COLUMN chinese_intent SET NOT NULL;
ALTER TABLE intent_lab DROP CONSTRAINT intent_lab_present;
COMMIT;
SELECT attname,attnotnull FROM pg_attribute
WHERE attrelid='pg_temp.intent_lab'::regclass AND attname='chinese_intent';

-- Expected 23502 after the CHECK has been removed.
BEGIN;
INSERT INTO intent_lab VALUES (3,NULL);
ROLLBACK;
SELECT * FROM intent_lab ORDER BY id;
DROP TABLE intent_lab;
