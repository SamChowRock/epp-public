-- Run ONE chosen transaction at a time, then COMMIT or ROLLBACK promptly.
BEGIN;
SET LOCAL lock_timeout = '1s';
UPDATE public.users SET web_enabled = false
WHERE id = '20000000-0000-4000-8000-000000000002'
  AND web_enabled = true
RETURNING id, status, web_enabled;
-- Inspect, then COMMIT or ROLLBACK. This retains all sessions and business rows.

-- Alternative, after the preceding transaction has ended: disable the account.
-- BEGIN;
-- SET LOCAL lock_timeout = '1s';
-- UPDATE public.users SET status = 'disabled'
-- WHERE id = '20000000-0000-4000-8000-000000000002' AND status = 'active'
-- RETURNING id, status, web_enabled;
-- Inspect, then COMMIT or ROLLBACK.
