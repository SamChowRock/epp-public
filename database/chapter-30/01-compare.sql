-- VERIFY only. Use one SQL editor/connection, in order. Each numbered block ends at a semicolon.
-- 1. Session-local data: 1 in 20 rows belongs to user 7; ten rows share each second.
CREATE TEMP TABLE page_lab (id integer PRIMARY KEY, user_id integer NOT NULL,
  created_at timestamptz NOT NULL, label text NOT NULL);
INSERT INTO page_lab SELECT n, n % 20, timestamptz '2026-01-01 00:00Z' +
  (n / 10) * interval '1 second', 'sample-' || n FROM generate_series(1,100) AS n;
ANALYZE page_lab;
-- 2. Small baseline. Repeat this exact SELECT after each change below.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, label FROM page_lab WHERE user_id = 7
ORDER BY created_at DESC, id DESC LIMIT 21;
-- 3. Grow the same table to 100000 rows; refresh the estimates, then repeat step 2.
INSERT INTO page_lab SELECT n, n % 20, timestamptz '2026-01-01 00:00Z' +
  (n / 10) * interval '1 second', 'sample-' || n FROM generate_series(101,100000) AS n;
ANALYZE page_lab;
-- 4. Test a single column, then repeat step 2.
CREATE INDEX page_lab_user ON page_lab(user_id);
-- 5. Add the candidate composite index, repeat step 2, compare leaf and Sort.
CREATE INDEX page_lab_feed ON page_lab(user_id, created_at DESC, id DESC);
-- 6. Deep offset returns the same number as the first page. Inspect its child rows.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, label FROM page_lab WHERE user_id = 7
ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET 4000;
-- 7. Check result equality and inspect the SQL boundary after row 4000 (id=20007).
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, label FROM page_lab WHERE user_id = 7
AND (created_at, id) < (timestamptz '2026-01-01 00:33:20Z', 20007)
ORDER BY created_at DESC, id DESC LIMIT 21;
-- 8. Compare index storage. Disconnect to discard the entire temporary lab.
SELECT pg_size_pretty(pg_relation_size('pg_temp.page_lab_user')) AS single_size,
       pg_size_pretty(pg_relation_size('pg_temp.page_lab_feed')) AS composite_size;
