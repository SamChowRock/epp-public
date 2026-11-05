-- DBeaver: execute each numbered selection in this same editor/connection.
-- All data below is temporary; ROLLBACK also works after a failed statement.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
CREATE TEMP TABLE page_lab (id integer PRIMARY KEY, created_at timestamptz(3) NOT NULL) ON COMMIT DROP;
INSERT INTO page_lab VALUES (4, '2026-11-05T00:00:00Z'), (3, '2026-11-05T00:00:00Z'),
 (2, '2026-11-05T00:00:00Z'), (1, '2026-11-05T00:00:00Z');
-- 1. First page: 4,3. Remember both values of row 3.
SELECT * FROM page_lab ORDER BY created_at DESC, id DESC LIMIT 2;
-- 2. Simulate a new committed head between two HTTP reads.
INSERT INTO page_lab VALUES (5, '2026-11-05T00:00:01Z');
-- 3. Offset page: 3,2. Row 3 repeats.
SELECT * FROM page_lab ORDER BY created_at DESC, id DESC LIMIT 2 OFFSET 2;
-- 4. Keyset page: 2,1. The strictly-lower boundary excludes row 3.
SELECT * FROM page_lab
 WHERE (created_at, id) < (timestamptz '2026-11-05T00:00:00Z', 3)
 ORDER BY created_at DESC, id DESC LIMIT 2;
-- 5. Removing the anchor does not remove its value boundary: still 2,1.
DELETE FROM page_lab WHERE id = 3;
SELECT * FROM page_lab
 WHERE (created_at, id) < (timestamptz '2026-11-05T00:00:00Z', 3)
 ORDER BY created_at DESC, id DESC LIMIT 2;
ROLLBACK;
