-- Run once in psql on a disposable cluster copied after chapter 81.
-- expected_db is taken independently from the deployment record.
\set ON_ERROR_STOP on
SELECT current_database() = :'expected_db' AS right_db \gset
\if :right_db
BEGIN;
CREATE ROLE epp_api_v2 LOGIN;
CREATE ROLE epp_notify_v2 LOGIN;
CREATE ROLE epp_mail_v2 LOGIN;
CREATE ROLE epp_receipt_v2 LOGIN;
CREATE ROLE epp_cleanup_v2 LOGIN;
GRANT epp_api TO epp_api_v2 WITH INHERIT TRUE, SET FALSE;
GRANT epp_mail TO epp_mail_v2 WITH INHERIT TRUE, SET FALSE;
GRANT epp_receipt74 TO epp_receipt_v2 WITH INHERIT TRUE, SET FALSE;
GRANT epp_cleanup TO epp_cleanup_v2 WITH INHERIT TRUE, SET FALSE;
-- Deliberately incomplete candidate for the notification trial. It can
-- start and lock a job, but cannot append a notification to the inbox.
GRANT CONNECT ON DATABASE :"expected_db" TO epp_notify_v2;
GRANT USAGE ON SCHEMA public TO epp_notify_v2;
GRANT SELECT ON notification_jobs, notifications, notification_recipients TO epp_notify_v2;
GRANT UPDATE (status) ON notification_jobs TO epp_notify_v2;
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'Wrong rotation database'; END $$;
\endif
