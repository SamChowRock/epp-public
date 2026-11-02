-- Observe from a THIRD idle editor in Auto-commit mode, outside BEGIN.
-- Match A/B by the PIDs obtained inside their editors; names are only labels.
-- Same role can inspect its own sessions. No administrator is required.
SELECT pid, application_name, state,
       xact_start IS NOT NULL AS transaction_open,
       wait_event_type, wait_event
FROM pg_stat_activity
WHERE datname = current_database()
  AND usename = current_user
ORDER BY pid;
