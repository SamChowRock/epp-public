-- Run the entire script in ONE connection; every new table/index is temporary.
BEGIN;
CREATE TEMP TABLE feed55 ON COMMIT DROP AS
  SELECT n AS id, n % 100 AS user_id,
         timestamptz '2026-01-01 00:00+00' + n * interval '1 second' AS created_at
  FROM generate_series(1, 40000) AS n;
ANALYZE pg_temp.feed55;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at FROM pg_temp.feed55 WHERE user_id=7
ORDER BY created_at DESC, id DESC LIMIT 21;
CREATE INDEX ON pg_temp.feed55 (user_id, created_at DESC, id DESC);
ANALYZE pg_temp.feed55;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at FROM pg_temp.feed55 WHERE user_id=7
ORDER BY created_at DESC, id DESC LIMIT 21;
ROLLBACK;
