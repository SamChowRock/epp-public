-- Two independent DBeaver connections to VERIFY. Do not Execute Script as a whole.
-- A: lock one newly issued, unconsumed registration intent for a NEW fictional email.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SELECT id, purpose, consumed_at IS NULL AS unused
FROM public.verification_intents
WHERE purpose = 'register' AND email = 'expiry36@example.test' FOR UPDATE;
-- Keep A open. B: run this short transaction; it waits for A.
BEGIN;
SET LOCAL lock_timeout = '20s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SELECT id FROM public.verification_intents
WHERE purpose = 'register' AND email = 'expiry36@example.test' FOR UPDATE;
-- A: expire this fictional intent, then COMMIT within B's 20s budget.
UPDATE public.verification_intents
SET issued_at = clock_timestamp() - interval '16 minutes',
    expires_at = clock_timestamp() - interval '1 second'
WHERE purpose = 'register' AND email = 'expiry36@example.test' AND consumed_at IS NULL;
COMMIT;
-- B: after acquiring the lock, run a fresh clock query; false means it cannot be consumed.
SELECT expires_at > clock_timestamp() AS valid_after_lock
FROM public.verification_intents
WHERE purpose = 'register' AND email = 'expiry36@example.test';
ROLLBACK;
-- If a lock timeout occurs, ROLLBACK that connection before retrying; end A too.
