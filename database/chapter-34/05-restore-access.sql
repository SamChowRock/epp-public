-- Restore each fact separately; enabling the account does not automatically grant Web access.
BEGIN;
SET LOCAL lock_timeout = '1s';
UPDATE public.users SET status = 'active'
WHERE id = '20000000-0000-4000-8000-000000000002' AND status = 'disabled'
RETURNING id, status, web_enabled;
-- Inspect, then COMMIT or ROLLBACK. Use 03-grant-web.sql separately if appropriate.
