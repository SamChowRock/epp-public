-- Replace the UUID with the intended existing account. Execute and inspect before COMMIT.
BEGIN;
SET LOCAL lock_timeout = '1s';
UPDATE public.users SET web_enabled = true
WHERE id = '20000000-0000-4000-8000-000000000002'
  AND status = 'active' AND web_enabled = false
RETURNING id, status, web_enabled;
-- Exactly one expected row: COMMIT; otherwise ROLLBACK and inspect the current state.
