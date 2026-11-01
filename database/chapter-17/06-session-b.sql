-- MANUAL. Run B0, then B1/B2/B3/B4 SELECT at the indicated A stages.
-- B0: verify distinct PID; stay in this editor/connection.
SELECT current_database(), current_user, pg_backend_pid();
BEGIN ISOLATION LEVEL READ COMMITTED;
SHOW transaction_isolation;

-- B1 after A1: zero. B2 after A2: Visible after commit.
-- B3 after A3: still Visible after commit. B4 after A4: same committed value.
-- Re-execute this SELECT each time; old result grids do not update themselves.
SELECT id, original_text FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000006'
  AND user_id = '10000000-0000-4000-8000-000000000001';

-- After B4, end this read transaction before A5.
COMMIT;

-- B5 after A5 cleanup: zero. Then rerun chapter-16/03-inspect-model.sql.
SELECT id, original_text FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000006';
