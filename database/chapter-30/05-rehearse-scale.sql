-- Optional: dedicated COPY of a chapter-29 VERIFY database, named ..._ch30_lab.
-- One connection, no other writers. Run all of this setup as a block, within BEGIN.
BEGIN;
DO $$
BEGIN
  IF right(current_database(), 9) <> '_ch30_lab' OR
     to_regclass('public.learning_records_user_feed_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'Use a separate _ch30_lab chapter-29 copy without the new index';
  END IF;
END $$;
CREATE TEMP TABLE source30 ON COMMIT DROP AS
SELECT r.capture_id, l.expression_id, c.english_text, c.chinese_meaning, l.user_id
FROM public.learning_records l
JOIN public.candidates c ON c.id = l.candidate_id
JOIN public.capture_revisions r ON r.id = c.revision_id
JOIN public.captures p ON p.id = r.capture_id AND p.user_id = l.user_id
JOIN public.expressions e ON e.id = l.expression_id AND e.user_id = l.user_id
WHERE l.user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY l.created_at, l.id LIMIT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM source30) THEN
    RAISE EXCEPTION 'Copy needs at least one owned learning record';
  END IF;
END $$;
CREATE TEMP TABLE sample30 ON COMMIT DROP AS
SELECT gen_random_uuid() AS rev, gen_random_uuid() AS cand, gen_random_uuid() AS lr,
       n + (SELECT max(revision_no) FROM public.capture_revisions r
            JOIN source30 s ON s.capture_id = r.capture_id) AS next_revision, n
FROM generate_series(1, 20000) AS n;
INSERT INTO public.capture_revisions(id, capture_id, revision_no, original_text, input_source)
SELECT rev, capture_id, next_revision, 'synthetic', 'manual' FROM sample30 CROSS JOIN source30;
INSERT INTO public.candidates(id, revision_id, candidate_no, english_text, chinese_meaning, status, accepted_at)
SELECT cand, rev, 1, english_text, chinese_meaning, 'accepted', now() FROM sample30 CROSS JOIN source30;
INSERT INTO public.learning_records(id, user_id, candidate_id, expression_id, created_at)
SELECT lr, user_id, cand, expression_id, timestamptz '2026-01-01 00:00Z' + n * interval '1 second'
FROM sample30 CROSS JOIN source30;
ANALYZE public.capture_revisions, public.candidates, public.learning_records,
        public.expressions, public.captures;
-- Stop here. Run the three statements of 03-owned-page.sql IN THIS SAME EDITOR.
-- Then run ONLY the CREATE INDEX from this chapter's migration (no BEGIN/COMMIT).
-- Repeat the three statements of 03-owned-page.sql. Finish with ROLLBACK.
