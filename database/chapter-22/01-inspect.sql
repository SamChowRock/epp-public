-- DBeaver DEV or VERIFY: execute the identity query first.
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
-- Every capture must have an initial revision. Expect missing_initial = 0.
SELECT count(*) AS captures, count(r.id) AS initial_revisions,
       count(*) FILTER (WHERE r.id IS NULL) AS missing_initial
FROM public.captures c LEFT JOIN public.capture_revisions r
  ON r.capture_id = c.id AND r.revision_no = 1;
-- Legacy content equals revision 1 even after new revisions exist. Expect no rows.
SELECT c.id FROM public.captures c LEFT JOIN public.capture_revisions r
  ON r.capture_id = c.id AND r.revision_no = 1
WHERE r.id IS NULL OR c.original_text IS DISTINCT FROM r.original_text
  OR c.chinese_intent IS DISTINCT FROM r.chinese_intent;
SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'public.capture_revisions'::regclass ORDER BY conname;
-- Examine a bounded history with stable record identity and separate times.
SELECT c.id AS capture_id, c.created_at AS capture_created_at,
  r.id AS revision_id, r.revision_no, r.original_text, r.chinese_intent,
  r.input_source, r.chunks, r.created_at AS revision_created_at
FROM public.captures c JOIN public.capture_revisions r ON r.capture_id = c.id
ORDER BY c.created_at, c.id, r.revision_no LIMIT 100;
-- Current contents, exactly one result per capture.
SELECT c.id, c.created_at, r.revision_no, r.original_text, r.chinese_intent
FROM public.captures c JOIN LATERAL (
  SELECT revision_no, original_text, chinese_intent FROM public.capture_revisions
  WHERE capture_id = c.id ORDER BY revision_no DESC LIMIT 1
) r ON true ORDER BY c.created_at, c.id LIMIT 100;
