-- Run each query separately. Replace zero UUIDs with the saved operation/candidate IDs.
SELECT current_database(), current_user, pg_backend_pid();
SELECT conname, pg_get_constraintdef(oid), condeferrable, convalidated
FROM pg_constraint WHERE conrelid='public.command_receipts'::regclass ORDER BY conname;

SELECT operation_id, action, candidate_id, status_code, recorded_at,
       response #>> '{learningRecord,id}' AS learning_record_id,
       response #>> '{expression,id}' AS expression_id
FROM public.command_receipts
WHERE user_id='10000000-0000-4000-8000-000000000001'
  AND operation_id='00000000-0000-4000-8000-000000000000';

SELECT n.id, n.status,
       (SELECT count(*) FROM public.learning_records l WHERE l.candidate_id=n.id) AS learning_records,
       (SELECT count(*) FROM public.command_receipts r WHERE r.candidate_id=n.id) AS receipts
FROM public.candidates n WHERE n.id='00000000-0000-4000-8000-000000000000';

-- Accepted legacy rows can legitimately have no receipt. Do not synthesize operation IDs.
SELECT n.id, n.status, l.id AS learning_record_id
FROM public.candidates n JOIN public.learning_records l ON l.candidate_id=n.id
WHERE NOT EXISTS (SELECT 1 FROM public.command_receipts r WHERE r.candidate_id=n.id)
ORDER BY n.id LIMIT 20;
