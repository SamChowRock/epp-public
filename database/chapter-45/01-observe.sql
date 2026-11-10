-- Run the first three statements before and after upgrading your VERIFY copy.
SELECT current_database();
SELECT id, recipient, purpose, status, available_at, claim_id, lease_until FROM verification_outbox ORDER BY id;
SELECT id, paused_by FROM verification_mail_control WHERE id=1;

SELECT split_part(o.recipient,'@',1) AS mailbox, o.status, o.attempts, o.last_failure,
       o.available_at, clock_timestamp() AS observed_at,
       c.paused_by IS NOT NULL AND c.paused_by=o.id AS holds_channel, o.id
FROM verification_outbox o CROSS JOIN verification_mail_control c WHERE c.id=1 ORDER BY o.available_at,o.id;

SELECT count(*) FILTER (WHERE due_at <= statement_timestamp()) AS ready,
       count(*) FILTER (WHERE due_at > statement_timestamp()) AS waiting,
       min(due_at) FILTER (WHERE due_at <= statement_timestamp()) AS oldest_ready
FROM (SELECT COALESCE(lease_until,available_at) AS due_at FROM verification_outbox WHERE status='pending') q;
