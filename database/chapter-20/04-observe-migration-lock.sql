-- READ ONLY, observer connection to the migration target database.
SELECT current_database(),current_user,pg_backend_pid();
SELECT pid,application_name,state,wait_event_type,wait_event,
       pg_blocking_pids(pid) AS blockers,
       clock_timestamp()-xact_start AS transaction_age
FROM pg_stat_activity
WHERE datname=current_database() AND pid<>pg_backend_pid()
ORDER BY xact_start NULLS LAST;
-- SQL text is deliberately omitted; it can contain private values.
