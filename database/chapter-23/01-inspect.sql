-- Run on DEV or VERIFY in DBeaver; all statements are read-only.
SELECT current_database(), current_user, inet_server_port();
SELECT column_name, udt_name AS type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'candidates'
ORDER BY ordinal_position;
SELECT conname, contype, convalidated
FROM pg_constraint
WHERE conrelid = 'public.candidates'::regclass
  AND contype IN ('p', 'u', 'f', 'c')
ORDER BY conname;
SELECT migration_name, finished_at, rolled_back_at
FROM public._prisma_migrations ORDER BY started_at;
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'public.candidates'::regclass ORDER BY conname;
SELECT c.id AS capture_id, r.id AS revision_id, r.revision_no,
       n.id AS candidate_id, n.candidate_no, n.english_text,
       n.status, n.discarded_at
FROM public.captures c
JOIN public.capture_revisions r ON r.capture_id = c.id
LEFT JOIN public.candidates n ON n.revision_id = r.id
WHERE c.user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY c.created_at, c.id, r.revision_no, n.candidate_no;
