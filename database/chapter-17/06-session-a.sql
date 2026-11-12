-- MANUAL STAGES. Never run this entire file as one script.
-- Same database as B, DIFFERENT pg_backend_pid(). Auto-commit UI mode.
-- A0: this reserved lab ID must be absent before starting.
SELECT current_database(), current_user, pg_backend_pid();
SELECT id, user_id, original_text FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000006';

-- A1: run, then pause for B1. A sees one row; B sees zero.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '3s';
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000006',
        '10000000-0000-4000-8000-000000000001', 'Visible after commit.')
RETURNING id, original_text;

-- A2: only after B1; then let B2 query again.
COMMIT;

-- A3: after B2; pause for B3 to read the old committed value.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '3s';
UPDATE public.captures SET original_text = 'Pending edit.'
WHERE id = '40000000-0000-4000-8000-000000000006'
  AND user_id = '10000000-0000-4000-8000-000000000001'
  AND original_text = 'Visible after commit.'
RETURNING id, original_text;

-- A4: after B3; let B4 query, then B should COMMIT its read transaction.
ROLLBACK;

-- A5: remove only this unchanged lab row, never the chapter 18 fixtures.
-- If the guarded delete returns zero, inspect rather than broadening WHERE.
BEGIN;
SET LOCAL lock_timeout = '3s';
DELETE FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000006'
  AND user_id = '10000000-0000-4000-8000-000000000001'
  AND original_text = 'Visible after commit.'
RETURNING id;
COMMIT;
