-- Execute in epp_migration_check only. Select each statement separately.
-- On the intentional error, execute ROLLBACK before any further query.
SELECT current_database(), current_user;

BEGIN;
SET LOCAL lock_timeout = '3s';
INSERT INTO public.users (id)
VALUES ('50000000-0000-4000-8000-000000000001');
-- Expected: SQLSTATE 23514, captures_original_text_nonempty.
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('50000000-0000-4000-8000-000000000002',
        '50000000-0000-4000-8000-000000000001', '');
ROLLBACK;

SELECT (SELECT count(*) FROM public.users) AS users,
       (SELECT count(*) FROM public.captures) AS captures;
