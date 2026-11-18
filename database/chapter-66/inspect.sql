-- DBeaver: select and run one statement at a time, in the verified practice database.
SELECT current_database(), current_user, inet_server_addr(), inet_server_port(), pg_backend_pid();

SELECT c.id, c.original_text AS initial_text, count(r.id) AS revision_count
FROM public.captures c LEFT JOIN public.capture_revisions r ON r.capture_id=c.id
GROUP BY c.id, c.original_text ORDER BY c.id;

SELECT id, database_name, upper_id, after_id, scanned, started_at, finished_at
FROM public.capture_integrity_scans ORDER BY started_at DESC;

SELECT q.id AS case_id, q.capture_id, q.rule, q.state,
       q.first_seen_at, q.last_seen_at, q.quarantined_at, q.repaired_at
FROM public.capture_integrity_cases q ORDER BY q.first_seen_at, q.id;

-- Only the maintenance identity reads source references or the private evidence document.
SELECT case_id, source_ref, evidence_sha256, applied_by, applied_at
FROM public.capture_integrity_repairs ORDER BY applied_at;
