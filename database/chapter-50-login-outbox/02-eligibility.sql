-- DBeaver manual transaction: replace ONLY the selected fictional user UUID.
BEGIN;
UPDATE public.users SET mini_enabled = false
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
RETURNING id, status, web_enabled, mini_enabled;
-- Expect exactly one selected user, then execute COMMIT separately. Otherwise ROLLBACK.
-- COMMIT;
-- After observing mini403/Web200, run the same transaction with mini_enabled = true.
-- This operation changes entry eligibility, not identity, ownership, pending mail or existing sessions.
