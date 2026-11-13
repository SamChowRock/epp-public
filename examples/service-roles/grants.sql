-- Use psql as the owner after creating three fresh, unprivileged LOGIN roles.
\set ON_ERROR_STOP on
SELECT current_database() = :'expected_db' AS right_db \gset
\if :right_db
BEGIN;
GRANT CONNECT ON DATABASE :"expected_db" TO epp_api, epp_mail, epp_notify;
GRANT USAGE ON SCHEMA public TO epp_api, epp_mail, epp_notify;

GRANT SELECT ON public.users, public.sessions, public.password_credentials,
  public.captures, public.capture_revisions, public.candidates, public.expressions,
  public.expression_forms, public.learning_records, public.command_receipts,
  public.verified_emails, public.verification_intents, public.verification_outbox,
  public.notification_jobs, public.notifications, public.nickname_changes,
  public.avatar_writes TO epp_api;
GRANT INSERT ON public.sessions, public.password_credentials, public.captures,
  public.capture_revisions, public.candidates, public.expressions, public.expression_forms,
  public.learning_records, public.command_receipts, public.verified_emails,
  public.verification_intents, public.nickname_changes, public.avatar_writes TO epp_api;
GRANT INSERT (id,intent_id,generation,purpose,recipient) ON public.verification_outbox TO epp_api;
GRANT INSERT (id,user_id,kind) ON public.notification_jobs TO epp_api;
GRANT INSERT (id) ON public.users TO epp_api;
GRANT UPDATE (nickname,nickname_visible,avatar_id,avatar_visible) ON public.users TO epp_api;
GRANT UPDATE (label), DELETE ON public.sessions TO epp_api;
GRANT UPDATE (password_hash,version) ON public.password_credentials TO epp_api;
GRANT UPDATE (status,accepted_at,discarded_at) ON public.candidates TO epp_api;
GRANT UPDATE (token_digest,issued_at,expires_at,consumed_at,user_id,credential_version) ON public.verification_intents TO epp_api;
GRANT UPDATE (read_at,cleared_at) ON public.notifications TO epp_api;
GRANT DELETE ON public.nickname_changes TO epp_api;
GRANT UPDATE (state,check_after) ON public.avatar_writes TO epp_api;

GRANT SELECT ON public.verification_intents, public.verification_outbox,
  public.verification_mail_control TO epp_mail;
GRANT UPDATE (token_digest) ON public.verification_intents TO epp_mail;
GRANT UPDATE (claim_id,lease_until,status,attempts,available_at,retry_digest,last_failure,retain_from)
  ON public.verification_outbox TO epp_mail;
GRANT UPDATE (paused_by) ON public.verification_mail_control TO epp_mail;

GRANT SELECT ON public.notification_jobs, public.notifications,
  public.notification_recipients TO epp_notify;
GRANT UPDATE (status) ON public.notification_jobs TO epp_notify;
GRANT INSERT (id,user_id,kind,created_at) ON public.notifications TO epp_notify;
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'Wrong deployment database'; END $$;
\endif
