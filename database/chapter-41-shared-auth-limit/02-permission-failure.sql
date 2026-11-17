-- DBeaver owner connection, isolated DB only. Replace epp41_api with the actual API role.
-- Run REVOKE, send one password request (503 AUTH_RATE_UNAVAILABLE), then restore.
-- An already logged-in GET /auth/me should remain 200: it uses different tables.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.auth_rate_buckets FROM epp41_api;
-- RESTORE in this same owner connection, even if the HTTP experiment failed:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_rate_buckets TO epp41_api;
-- Do not grant these permissions to mail/notify/admin roles.
