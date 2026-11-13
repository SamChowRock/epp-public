\set ON_ERROR_STOP on
SELECT current_database() = :'expected_db' AS right_db \gset
\if :right_db
BEGIN;
GRANT epp_notify TO epp_notify_v2 WITH INHERIT TRUE, SET FALSE;
REVOKE UPDATE (status) ON notification_jobs FROM epp_notify_v2;
REVOKE SELECT ON notification_jobs, notifications, notification_recipients FROM epp_notify_v2;
REVOKE USAGE ON SCHEMA public FROM epp_notify_v2;
REVOKE CONNECT ON DATABASE :"expected_db" FROM epp_notify_v2;
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'Wrong rotation database'; END $$;
\endif
