\set ON_ERROR_STOP on
SELECT current_database() = :'expected_db' AS right_db \gset
\if :right_db
BEGIN;
SET LOCAL lock_timeout = '2s';
-- Run in the same owner session that populated ch78_approved, in the release copy.
WITH eligible AS (
  SELECT r.*, a.intent
  FROM ch78_approved a
  JOIN public.captures c ON c.id = a.capture_id AND c.user_id = a.user_id
  JOIN public.capture_revisions r ON r.capture_id = c.id AND r.id = a.expected_revision
  WHERE r.chinese_intent IS NULL
    AND NOT EXISTS (SELECT FROM public.capture_revisions later
                    WHERE later.capture_id = c.id AND later.revision_no > r.revision_no)
    AND NOT EXISTS (SELECT FROM public.capture_integrity_cases q
                    WHERE q.capture_id = c.id AND q.state = 'quarantined')
  ORDER BY c.id
  LIMIT 100
)
INSERT INTO public.capture_revisions
  (id,capture_id,revision_no,original_text,chinese_intent,input_source,chunks)
SELECT gen_random_uuid(),capture_id,revision_no+1,original_text,intent,input_source,chunks
FROM eligible
ON CONFLICT (capture_id,revision_no) DO NOTHING
RETURNING capture_id,id AS new_revision,revision_no;
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'Wrong release database'; END $$;
\endif
