BEGIN;
UPDATE public.users SET mini_enabled = false
WHERE id = '00000000-0000-4000-8000-000000000037'
RETURNING id, status, web_enabled, mini_enabled;
-- Inspect one intended row, then COMMIT or ROLLBACK separately.
-- Existing token: /auth/me -> 403; /auth/logout remains available.
