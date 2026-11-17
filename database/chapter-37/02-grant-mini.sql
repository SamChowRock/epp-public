-- VERIFY only. Replace with the intended local user ID after confirming the mapping.
BEGIN;
UPDATE public.users SET mini_enabled = true
WHERE id = '00000000-0000-4000-8000-000000000037' AND status = 'active'
RETURNING id, status, web_enabled, mini_enabled;
-- Exactly one intended row: COMMIT; otherwise ROLLBACK. Execute that decision separately.
