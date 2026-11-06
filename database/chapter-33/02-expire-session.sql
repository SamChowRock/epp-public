-- VERIFY only. Replace with the public session ID returned by /auth/me.
-- This changes only the selected live session; it does not change the password or old records.
BEGIN;
UPDATE public.sessions
SET created_at = LEAST(created_at, clock_timestamp() - interval '2 seconds'),
    expires_at = clock_timestamp() - interval '1 second'
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
RETURNING id, expires_at;
COMMIT;
