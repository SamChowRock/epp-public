-- VERIFY only: choose and save a new UUID. Duplicate execution must fail, not overwrite.
INSERT INTO public.users(id)
VALUES ('20000000-0000-4000-8000-000000000002')
RETURNING id, status, web_enabled, created_at;
-- Password initialization and Web access are separate steps; no password in SQL.
