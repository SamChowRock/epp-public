-- Run in psql as the owner on the isolated deployment database.
\set ON_ERROR_STOP on
SELECT current_database() = :'expected_db' AS right_db \gset
\if :right_db
BEGIN;
GRANT CONNECT ON DATABASE :"expected_db" TO epp57_run;
GRANT USAGE ON SCHEMA public TO epp57_run;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.users, public.sessions, public.password_credentials, public.captures,
  public.capture_revisions, public.candidates, public.expressions, public.expression_forms,
  public.learning_records, public.verified_emails, public.verification_intents,
  public.verification_outbox, public.verification_mail_control, public.notification_jobs,
  public.notifications, public.nickname_changes, public.avatar_writes TO epp57_run;
GRANT SELECT, INSERT ON public.command_receipts, public.web_access_receipts TO epp57_run;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO epp57_run;
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'Wrong deployment database'; END $$;
\endif
