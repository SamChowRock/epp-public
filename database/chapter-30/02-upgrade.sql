-- Run these read-only statements before and after migrate deploy in the SAME VERIFY database.
SELECT current_database(), count(*) AS learning_rows FROM public.learning_records;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'learning_records' ORDER BY indexname;
-- Isolate the ordered base-table read. The HTTP list also checks expression and capture ownership.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, expression_id, candidate_id FROM public.learning_records
WHERE user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY created_at DESC, id DESC LIMIT 21;
SELECT id, created_at FROM public.learning_records
WHERE user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY created_at DESC, id DESC LIMIT 21;
