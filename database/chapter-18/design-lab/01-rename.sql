-- Run each numbered group separately in the same DBeaver editor.
-- Temporary tables only. Never replace this name with public.captures.
SELECT current_database(), current_user;

-- A: dropping and adding is not renaming. Run through INSERT first.
BEGIN;
CREATE TEMP TABLE rename_example (
  original_text text NOT NULL,
  CONSTRAINT rename_nonempty CHECK (char_length(original_text) > 0)
) ON COMMIT DROP;
INSERT INTO rename_example (original_text) VALUES ('  Keep my spaces.  ');

-- Expected 23502: the newly added NOT NULL column has no value for the old row.
ALTER TABLE rename_example DROP COLUMN original_text, ADD COLUMN text text NOT NULL;
-- Execute alone after the expected error.
ROLLBACK;

-- B: rename preserves the original value and the constraint's column reference.
BEGIN;
CREATE TEMP TABLE rename_example (
  original_text text NOT NULL,
  CONSTRAINT rename_nonempty CHECK (char_length(original_text) > 0)
) ON COMMIT DROP;
INSERT INTO rename_example (original_text) VALUES ('  Keep my spaces.  ');
ALTER TABLE rename_example RENAME COLUMN original_text TO text;
SELECT text, char_length(text) AS characters FROM rename_example;
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid = 'pg_temp.rename_example'::regclass;
ROLLBACK;
