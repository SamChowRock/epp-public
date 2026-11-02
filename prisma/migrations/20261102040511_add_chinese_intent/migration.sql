-- Nullable expansion: old rows keep unknown intent, not fabricated text.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

ALTER TABLE public.captures ADD COLUMN chinese_intent text;
ALTER TABLE public.captures ADD CONSTRAINT captures_chinese_intent_shape
  CHECK (chinese_intent IS NULL OR
    (char_length(chinese_intent) BETWEEN 1 AND 1000 AND btrim(chinese_intent) <> ''));

COMMIT;
