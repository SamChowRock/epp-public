SELECT current_database(), current_user, pg_backend_pid();
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('candidates','expressions','expression_forms','learning_records')
ORDER BY table_name, ordinal_position;
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid IN ('public.candidates'::regclass,'public.expressions'::regclass,
 'public.expression_forms'::regclass,'public.learning_records'::regclass) ORDER BY 1,2;
-- Replace the all-zero UUID with the candidate ID returned by your own request.
SELECT n.id, n.status, n.accepted_at, l.id AS learning_id, e.meaning, f.text
FROM public.candidates n LEFT JOIN public.learning_records l ON l.candidate_id=n.id
LEFT JOIN public.expressions e ON e.id=l.expression_id
LEFT JOIN public.expression_forms f ON f.expression_id=e.id
WHERE n.id='00000000-0000-0000-0000-000000000000'::uuid;
