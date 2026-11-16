-- Run only on the chapter's isolated VERIFY copy. Replace example identities.
SELECT action, operation_id, capture_id, status_code, location,
       response->>'id' AS result_id, response->>'revisionNo' AS revision_no,
       recorded_at
FROM public.capture_write_receipts
WHERE user_id = '10000000-0000-4000-8000-000000000001'
  AND action = 'create-capture/v1' -- append-revision/v1 for an append
  AND operation_id = '30000000-0000-4000-8000-000000000099' -- replace with your saved key
ORDER BY recorded_at;

SELECT c.id, c.user_id, r.id AS revision_id, r.revision_no, r.original_text
FROM public.captures c JOIN public.capture_revisions r ON r.capture_id = c.id
WHERE c.id = '30000000-0000-4000-8000-000000000010'
ORDER BY r.revision_no;

SELECT conname, pg_get_constraintdef(oid) AS definition, convalidated, condeferrable
FROM pg_constraint WHERE conrelid = 'public.capture_write_receipts'::regclass;

-- Observe locks while another session holds this exact operation. Use your key.
SELECT pid, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'epp-api';
