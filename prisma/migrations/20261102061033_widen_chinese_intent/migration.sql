BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

ALTER TABLE public.captures
  DROP CONSTRAINT captures_chinese_intent_shape;
ALTER TABLE public.captures
  ADD CONSTRAINT captures_chinese_intent_shape
  CHECK (
    chinese_intent IS NULL OR (
      char_length(chinese_intent) BETWEEN 1 AND 2000
      AND btrim(chinese_intent) <> ''
    )
  );
COMMIT;
