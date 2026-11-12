-- Run each SELECT in the DBeaver editor for the isolated verification database.
SELECT current_database();
SELECT status, count(*) AS jobs
FROM public.verification_outbox
GROUP BY status ORDER BY status;

-- Before starting the worker, inspect everything it could pick, in pickup order.
SELECT id AS message_id, recipient, purpose, available_at
FROM public.verification_outbox
WHERE status = 'pending' AND available_at <= clock_timestamp()
ORDER BY available_at, id;

-- Replace the address with your own fictional fixture. This includes previous generations.
SELECT o.id AS message_id, o.purpose, o.available_at, o.status,
       CASE WHEN i.id IS NULL THEN 'missing'
            WHEN i.consumed_at IS NULL THEN 'unconsumed'
            ELSE 'consumed' END AS current_intent_state
FROM public.verification_outbox o
LEFT JOIN public.verification_intents i ON i.id = o.intent_id
WHERE o.recipient = 'reader43@example.test'
ORDER BY o.available_at, o.id;

-- PIDs here are PostgreSQL backend processes, not the Node PIDs in the dev terminal.
SELECT application_name, state, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database() AND application_name IN ('epp-api','epp-worker')
GROUP BY application_name, state ORDER BY application_name, state;

-- Run after deploying the chapter 51 migration. A UUID identifies the incident.
SELECT paused_by AS blocking_message FROM public.verification_mail_control WHERE id = 1;
