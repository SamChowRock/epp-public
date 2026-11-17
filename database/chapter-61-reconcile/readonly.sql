-- psql only: psql ... -v expected_db=your_verify -f this-file
-- Run once as administrator; a pre-existing role makes CREATE ROLE fail.
\set ON_ERROR_STOP on
SELECT current_database() = :'expected_db' AS target_ok \gset
\if :target_ok
BEGIN;
CREATE ROLE epp_avatar_auditor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE :"expected_db" TO epp_avatar_auditor;
GRANT USAGE ON SCHEMA public TO epp_avatar_auditor;
GRANT SELECT (id, avatar_id) ON public.users TO epp_avatar_auditor;
GRANT SELECT (id, user_id, state, created_at, check_after) ON public.avatar_writes TO epp_avatar_auditor;
ALTER ROLE epp_avatar_auditor SET default_transaction_read_only = on;
COMMIT;
\else
\echo Target database mismatch; no grants applied.
\quit 1
\endif
-- Set a fresh password interactively in the same verified psql session:
-- \password epp_avatar_auditor
-- Never grant this role to the API, worker, or maintenance roles.
