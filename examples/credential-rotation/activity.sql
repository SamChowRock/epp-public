-- Run on the isolated cluster as its observer. Include other databases when
-- checking whether a cluster-wide LOGIN can be retired.
SELECT datname, usename, application_name, pid, backend_start, state
FROM pg_stat_activity
WHERE usename IN ('epp_api', 'epp_api_v2', 'epp_mail', 'epp_mail_v2',
                  'epp_notify', 'epp_notify_v2', 'epp_receipt74', 'epp_receipt_v2',
                  'epp_cleanup', 'epp_cleanup_v2')
ORDER BY datname, usename, backend_start, pid;
