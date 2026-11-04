-- 先核对数据库；只在本章目标连接执行。
SELECT current_database(), current_user, current_setting('server_encoding');
SELECT name, public.epp_normalize_v1(value) AS normalized FROM (VALUES
  ('ASCII spaces/case', E'  TAKE\tA\nBREAK  '),
  ('NFC composed', 'café'), ('NFC decomposed', U&'cafe\0301'),
  ('fullwidth stays distinct', 'Ａ'), ('ASCII A', 'A')
) samples(name, value);

SELECT e.id AS expression_id, e.meaning, f.text, f.normalized_text,
  e.normalized_meaning, e.semantic_key IS NOT NULL AS reusable,
  (SELECT count(*) FROM public.learning_records l WHERE l.expression_id=e.id) AS learning_records
FROM public.expressions e JOIN public.expression_forms f ON f.expression_id=e.id
ORDER BY e.created_at, e.id;

SELECT l.id AS learning_record_id, l.candidate_id, l.expression_id,
  r.revision_no AS source_revision, n.english_text AS source_text,
  n.status, l.created_at
FROM public.learning_records l JOIN public.candidates n ON n.id=l.candidate_id
JOIN public.capture_revisions r ON r.id=n.revision_id
ORDER BY l.created_at,l.id;

SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid IN ('public.expressions'::regclass,'public.expression_forms'::regclass)
ORDER BY conname;
