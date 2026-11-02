-- One DEV editor/session; TEMP tables contain fabricated, reviewed intent only.
CREATE TEMP TABLE backfill_capture (id integer PRIMARY KEY, user_id integer NOT NULL, intent text);
CREATE TEMP TABLE reviewed_intent (id integer, user_id integer, intent text NOT NULL,
  PRIMARY KEY (id,user_id));
INSERT INTO backfill_capture VALUES (1,7,NULL),(2,7,NULL),(3,7,'用户刚刚填写'),(4,7,NULL),(5,7,NULL);
INSERT INTO reviewed_intent VALUES (1,7,'确认值一'),(2,7,'确认值二'),(3,7,'过期建议三'),(4,7,'确认值四');

-- Execute this WHOLE block repeatedly, not individual pieces of its CTE.
-- Each block commits at most two eligible rows; the current value is rechecked.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
WITH batch AS (
  SELECT c.id,c.user_id,r.intent
  FROM backfill_capture c JOIN reviewed_intent r USING (id,user_id)
  WHERE c.intent IS NULL ORDER BY c.id LIMIT 2
)
UPDATE backfill_capture c SET intent=b.intent
FROM batch b WHERE c.id=b.id AND c.user_id=b.user_id AND c.intent IS NULL
RETURNING c.id,c.intent;
COMMIT;

-- First batch changes 1/2; second changes 4; third changes none.
-- 3 is preserved. 5 has no source, so zero changed does NOT mean all filled.
SELECT * FROM backfill_capture ORDER BY id;
SELECT c.id,CASE WHEN r.id IS NULL THEN 'no reviewed source' ELSE 'eligible' END AS reason
FROM backfill_capture c LEFT JOIN reviewed_intent r USING (id,user_id)
WHERE c.intent IS NULL ORDER BY c.id;
-- Clean up after completing the repeated batches and inspecting the remaining row.
DROP TABLE reviewed_intent,backfill_capture;
