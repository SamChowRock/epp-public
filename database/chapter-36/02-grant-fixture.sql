-- VERIFY only. Replace the marker with the UUID returned by your registration.
-- Select and run BEGIN/UPDATE first; inspect one exact row, then COMMIT or ROLLBACK separately.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
UPDATE public.users SET web_enabled = true
WHERE id = 'REPLACE_WITH_REGISTERED_UUID'::uuid
  AND status = 'active'
  AND EXISTS (SELECT 1 FROM public.verified_emails e
              WHERE e.user_id = users.id AND e.email = 'reader36@example.test')
RETURNING id, status, web_enabled;
-- COMMIT;
-- ROLLBACK;
