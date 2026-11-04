SELECT current_database(), current_user, pg_backend_pid();
-- Before migration: zero rows is necessary, not proof that all business facts are correct.
SELECT candidate_id, count(*) AS records, array_agg(id ORDER BY id) AS learning_ids
FROM public.learning_records GROUP BY candidate_id HAVING count(*) > 1;
-- Inspect all affected rows before deciding whether/how to reconcile a duplicate.
SELECT l.id, l.candidate_id, l.user_id, l.expression_id, n.status, c.user_id AS source_user
FROM public.learning_records l JOIN public.candidates n ON n.id=l.candidate_id
JOIN public.capture_revisions r ON r.id=n.revision_id JOIN public.captures c ON c.id=r.capture_id
WHERE l.candidate_id IN (SELECT candidate_id FROM public.learning_records GROUP BY candidate_id HAVING count(*)>1)
ORDER BY l.candidate_id,l.id;
SELECT conname, pg_get_constraintdef(oid), convalidated, condeferrable
FROM pg_constraint WHERE conrelid='public.learning_records'::regclass
AND conname='learning_records_candidate_id_key';
-- Replace the all-zero UUID with your candidate ID.
SELECT n.status, n.accepted_at, n.discarded_at, count(l.id) AS records
FROM public.candidates n LEFT JOIN public.learning_records l ON l.candidate_id=n.id
WHERE n.id='00000000-0000-0000-0000-000000000000'::uuid GROUP BY n.id;
