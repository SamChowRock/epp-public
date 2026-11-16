-- OPTIONAL isolated capacity experiment, separate from the browser's real peer bucket.
-- Run in ONE SQL editor connection. ROLLBACK removes all synthetic rows.
BEGIN;
SELECT pg_advisory_xact_lock(4542544,41);
-- Proceed only when 01-observe shows zero rows: do not clear other people's quotas.
INSERT INTO public.auth_rate_buckets(rule_key,source_key,opened_at,expires_at,used)
SELECT 'password-auth/v1', 'chapter41-synthetic-' || i, t, t + interval '60 seconds', 1
FROM generate_series(1,1000) i CROSS JOIN (SELECT date_trunc('milliseconds',clock_timestamp()) t) clock;
SELECT count(*) FROM public.auth_rate_buckets WHERE rule_key = 'password-auth/v1';
ROLLBACK;
