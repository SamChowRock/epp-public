-- PostgreSQL 18, one DBeaver editor/session. Temporary table only.
-- Run numbered stages separately. Roll back each intentional error before continuing.
SELECT current_database(), current_user, pg_backend_pid();
CREATE TEMP TABLE intent_native_lab (id integer PRIMARY KEY, chinese_intent text);
INSERT INTO intent_native_lab VALUES (1,NULL),(2,'用户已确认的意图');

-- 1. Native NOT VALID protects new writes but keeps historical NULL.
BEGIN;
SET LOCAL lock_timeout='2s';
ALTER TABLE intent_native_lab ADD CONSTRAINT intent_native_present
  NOT NULL chinese_intent NOT VALID;
COMMIT;
SELECT a.attnotnull,c.contype,c.convalidated
FROM pg_attribute a JOIN pg_constraint c
  ON c.conrelid=a.attrelid AND a.attnum=ANY(c.conkey)
WHERE a.attrelid='pg_temp.intent_native_lab'::regclass
  AND a.attname='chinese_intent' AND c.contype='n';
SELECT * FROM intent_native_lab ORDER BY id;
-- Expected true / n / false, while row 1 still contains NULL.

-- 2. Both statements below fail with 23502, in separate transactions.
BEGIN;
INSERT INTO intent_native_lab VALUES (3,NULL);
ROLLBACK;
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
ALTER TABLE intent_native_lab VALIDATE CONSTRAINT intent_native_present;
ROLLBACK;

-- 3. Use a supplied, reviewed value; do not overwrite a user's existing value.
BEGIN;
UPDATE intent_native_lab
SET chinese_intent='这条实验记录经确认后补充的意图'
WHERE id=1 AND chinese_intent IS NULL;
COMMIT;
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
ALTER TABLE intent_native_lab VALIDATE CONSTRAINT intent_native_present;
COMMIT;
SELECT a.attnotnull,c.contype,c.convalidated
FROM pg_attribute a JOIN pg_constraint c
  ON c.conrelid=a.attrelid AND a.attnum=ANY(c.conkey)
WHERE a.attrelid='pg_temp.intent_native_lab'::regclass
  AND a.attname='chinese_intent' AND c.contype='n';
SELECT * FROM intent_native_lab ORDER BY id;
-- Expected true / n / true. Keep the native constraint: it is the final protection.
DROP TABLE intent_native_lab;
