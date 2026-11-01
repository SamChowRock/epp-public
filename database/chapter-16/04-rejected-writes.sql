-- Manual experiments, NOT an initialization or migration script.
-- Select ONE BEGIN + failing statement in psql/DBeaver, observe the error,
-- then execute its ROLLBACK separately even if the client stopped on error.
-- Use the chapter-16 development schema and seed. No experiment is committed.

-- 23503: a well-formed UUID does not mean the referenced user exists.
BEGIN;
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000099', 'Missing owner.');
ROLLBACK;

-- 23502: a foreign key alone would allow NULL; NOT NULL rejects it.
BEGIN;
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('30000000-0000-4000-8000-000000000002', NULL, 'Missing owner.');
ROLLBACK;

-- 23505: two records cannot share one primary key.
BEGIN;
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001', 'Duplicate ID.');
ROLLBACK;

-- 23514: empty text is non-NULL, so it needs a separate constraint.
BEGIN;
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('30000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000001', '');
ROLLBACK;

-- 23503: deleting the owner cannot leave existing captures without a parent.
BEGIN;
DELETE FROM public.users WHERE id = '10000000-0000-4000-8000-000000000001';
ROLLBACK;
