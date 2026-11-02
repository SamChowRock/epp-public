-- Use a separate epp_owner observation connection; leave auto-commit ON.
SELECT current_database(), current_user, pg_backend_pid();
SELECT pid, application_name, state, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocked_by
FROM pg_stat_activity
WHERE datname = current_database() AND usename = current_user
  AND application_name = 'epp-api'
ORDER BY pid;
-- Re-run, rather than reading a cached result tab. Idle pool slots may disappear after 10s.
