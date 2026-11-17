-- DBeaver owner connection to the isolated VERIFY only.
-- First create epp41_api as a LOGIN with a fresh private password, no ownership,
-- no superuser/CREATEDB/CREATEROLE privileges and no inherited owner role.
-- Replace the database name below with the independently recorded VERIFY name.
GRANT CONNECT ON DATABASE epp_ch41_verify TO epp41_api;
GRANT USAGE ON SCHEMA public TO epp41_api;
GRANT SELECT ON public.users, public.password_credentials, public.sessions,
  public.captures, public.capture_revisions, public.candidates, public.expressions,
  public.expression_forms, public.learning_records, public.command_receipts,
  public.capture_write_receipts TO epp41_api;
GRANT INSERT ON public.sessions, public.captures, public.capture_revisions,
  public.candidates, public.expressions, public.expression_forms,
  public.learning_records, public.command_receipts, public.capture_write_receipts TO epp41_api;
-- The current login transaction locks users FOR UPDATE; PG needs an UPDATE column.
-- This is an interim chapter41 role, before chapter71 introduces a read-only locking view.
GRANT UPDATE (id) ON public.users TO epp41_api;
GRANT UPDATE (password_hash) ON public.password_credentials TO epp41_api;
GRANT UPDATE (label), DELETE ON public.sessions TO epp41_api;
GRANT UPDATE (chinese_intent) ON public.captures TO epp41_api;
GRANT UPDATE (status, accepted_at, discarded_at) ON public.candidates TO epp41_api;
GRANT EXECUTE ON FUNCTION public.epp_identity_v1(text,text), public.epp_normalize_v1(text) TO epp41_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_rate_buckets TO epp41_api;
