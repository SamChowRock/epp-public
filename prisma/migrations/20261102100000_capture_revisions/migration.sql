-- Stop all old writers before deployment; retain legacy columns for comparison.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
LOCK TABLE public.captures IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.capture_revisions (
  id uuid CONSTRAINT capture_revisions_pkey PRIMARY KEY,
  capture_id uuid NOT NULL,
  revision_no integer NOT NULL,
  original_text text NOT NULL,
  chinese_intent text,
  input_source text NOT NULL,
  chunks jsonb,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT capture_revisions_capture_id_fkey FOREIGN KEY (capture_id)
    REFERENCES public.captures(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT capture_revisions_capture_no_key UNIQUE (capture_id, revision_no),
  CONSTRAINT capture_revisions_no_positive CHECK (revision_no > 0),
  CONSTRAINT capture_revisions_original_nonempty CHECK (char_length(original_text) > 0),
  CONSTRAINT capture_revisions_intent_shape CHECK (chinese_intent IS NULL OR
    (char_length(chinese_intent) BETWEEN 1 AND 2000 AND btrim(chinese_intent) <> '')),
  CONSTRAINT capture_revisions_source CHECK (input_source IN ('manual', 'unknown')),
  CONSTRAINT capture_revisions_chunks_shape CHECK (
    chunks IS NULL OR CASE WHEN jsonb_typeof(chunks) = 'array'
      THEN jsonb_array_length(chunks) <= 25 ELSE false END)
);
-- Existing capture IDs are reused as revision IDs only for revision 1.
-- IDs live in different tables; all later revisions receive fresh UUIDs.
INSERT INTO public.capture_revisions
  (id, capture_id, revision_no, original_text, chinese_intent, input_source, chunks, created_at)
SELECT id, id, 1, original_text, chinese_intent, 'unknown', NULL, CURRENT_TIMESTAMP
FROM public.captures;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.captures c LEFT JOIN public.capture_revisions r
      ON r.capture_id = c.id AND r.revision_no = 1
    WHERE r.id IS NULL OR r.original_text IS DISTINCT FROM c.original_text
      OR r.chinese_intent IS DISTINCT FROM c.chinese_intent
  ) THEN RAISE EXCEPTION 'Revision backfill mismatch'; END IF;
END $$;
COMMIT;
