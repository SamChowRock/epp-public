BEGIN;
CREATE TEMP TABLE side35_pairs (owner_group integer, channel_group integer);
INSERT INTO pg_temp.side35_pairs
SELECT n % 100, n % 100 FROM generate_series(1, 10000) AS s(n);

ANALYZE pg_temp.side35_pairs;
SELECT count(*) AS total,
       count(*) FILTER (WHERE owner_group = 7) AS by_owner,
       count(*) FILTER (WHERE channel_group = 7) AS by_channel,
       count(*) FILTER (WHERE owner_group = 7 AND channel_group = 7) AS both
FROM pg_temp.side35_pairs;

EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT * FROM pg_temp.side35_pairs WHERE owner_group = 7 AND channel_group = 7;

CREATE STATISTICS pg_temp.side35_pair_dependency (dependencies)
  ON owner_group, channel_group FROM pg_temp.side35_pairs;
ANALYZE pg_temp.side35_pairs;

EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT * FROM pg_temp.side35_pairs WHERE owner_group = 7 AND channel_group = 7;

EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT * FROM pg_temp.side35_pairs WHERE owner_group = 7 AND channel_group = 8;

ROLLBACK;
