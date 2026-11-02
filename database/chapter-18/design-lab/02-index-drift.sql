-- Use only the dedicated chapter-18 epp_migration_check connection.
-- Run sections separately; inspect Prisma status/diff between CREATE and DROP.
SELECT current_database(), current_user;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'captures'
ORDER BY indexname;

-- No IF NOT EXISTS: an existing name must be investigated, not overwritten.
CREATE INDEX captures_created_at_lab_idx ON public.captures (created_at);

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'captures'
ORDER BY indexname;

-- Run only after the comparison, and only for the index created by this exercise.
DROP INDEX public.captures_created_at_lab_idx;
