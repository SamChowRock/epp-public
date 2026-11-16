-- 在已迁移的练习库执行整份脚本；不在生产库执行。每轮新UUID标记，只插入新素材。
-- 同一SQL会话后续运行02/03/04；临时映射只保存本轮ID，不通过旧正文猜测修改目标。
BEGIN;
CREATE TEMP TABLE ch34_run ON COMMIT PRESERVE ROWS AS
SELECT gen_random_uuid() AS run_id, '10000000-0000-4000-8000-000000000001'::uuid AS user_id;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM users WHERE id = (SELECT user_id FROM ch34_run))
  THEN RAISE EXCEPTION 'Fixed development user missing; prepare the chapter database first'; END IF;
END $$;
CREATE TEMP TABLE ch34_samples ON COMMIT PRESERVE ROWS AS
SELECT n, gen_random_uuid() AS id, run_id, user_id,
  CASE WHEN n = 0 THEN '2026-01-01T00:00:00.000Z'::timestamptz
       WHEN n >= 102 THEN '2026-01-03T00:00:00.000Z'::timestamptz
       ELSE '2026-01-02T00:00:00.000Z'::timestamptz END AS created_at
FROM ch34_run CROSS JOIN generate_series(0, 104) AS n;
INSERT INTO captures(id, user_id, original_text, created_at)
SELECT id, user_id, 'ch34 initial ' || run_id || ' #' || n, created_at FROM ch34_samples;
-- Preserve each initial snapshot, including the historical-only match at #104.
INSERT INTO capture_revisions(id, capture_id, revision_no, original_text, input_source, created_at)
SELECT gen_random_uuid(), id, 1,
  CASE WHEN n = 104 THEN 'ch34-match:' || run_id || ' historical only'
       ELSE 'ch34 initial ' || run_id || ' #' || n END, 'manual', created_at FROM ch34_samples;
INSERT INTO capture_revisions(id, capture_id, revision_no, original_text, input_source)
SELECT gen_random_uuid(), id, 2,
  CASE WHEN n BETWEEN 1 AND 101 THEN 'ch34-match:' || run_id || ' #' || n
       ELSE 'ch34 nonmatch ' || run_id || ' #' || n END, 'manual' FROM ch34_samples;
DO $$ BEGIN
  IF (SELECT count(*) FROM ch34_samples) <> 105 THEN RAISE EXCEPTION 'Unexpected sample count'; END IF;
END $$;
COMMIT;
SELECT current_database(), run_id, 'ch34-match:' || run_id AS q, user_id FROM ch34_run;
-- 预期：新q旧列表101条；limit=100为100；新默认20，逐页20/20/20/20/20/1。
-- 要开始新一轮，先按04清理，再断开并重新连接；不要复用临时表或修改历史记录。
