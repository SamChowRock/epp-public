-- Use only a fabricated record from this chapter. Replace this zero UUID.
-- Run BEGIN and the INSERT separately. After 23505, execute ROLLBACK separately.
BEGIN;
INSERT INTO public.capture_revisions
  (id, capture_id, revision_no, original_text, chinese_intent, input_source, chunks)
SELECT gen_random_uuid(), capture_id, revision_no, original_text, chinese_intent, input_source, chunks
FROM public.capture_revisions
WHERE capture_id = '00000000-0000-0000-0000-000000000000'::uuid AND revision_no = 1;
ROLLBACK;
-- INSERT 0 0 means the ID was not replaced/found; it does not prove rejection.
