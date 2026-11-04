BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- One versioned implementation serves both historical backfill and live writes.
CREATE FUNCTION public.epp_normalize_v1(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN translate(btrim(regexp_replace(normalize(value, NFC), E'[ \t\n\r\f\013]+', ' ', 'g')),
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');

CREATE FUNCTION public.epp_identity_v1(english text, meaning text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN encode(sha256(convert_to(jsonb_build_array('epp-expression/v1',
  public.epp_normalize_v1(english), public.epp_normalize_v1(meaning))::text, 'UTF8')), 'hex');

-- Previous chapters create one form and one owner per expression. Refuse ambiguous history.
DO $$ BEGIN
  IF EXISTS (SELECT e.id FROM public.expressions e
    LEFT JOIN public.expression_forms f ON f.expression_id = e.id
    GROUP BY e.id HAVING count(f.id) <> 1)
    OR EXISTS (SELECT e.id FROM public.expressions e
    LEFT JOIN public.learning_records l ON l.expression_id = e.id
    GROUP BY e.id HAVING count(DISTINCT l.user_id) <> 1) THEN
    RAISE EXCEPTION 'Expression history needs owner/form review';
  END IF;
END $$;

ALTER TABLE public.expressions ADD COLUMN user_id uuid,
  ADD COLUMN normalized_meaning text, ADD COLUMN semantic_key text;
ALTER TABLE public.expression_forms ADD COLUMN normalized_text text;
UPDATE public.expression_forms SET normalized_text = public.epp_normalize_v1(text);
UPDATE public.expressions e SET user_id = owners.user_id,
  normalized_meaning = public.epp_normalize_v1(e.meaning),
  semantic_key = public.epp_identity_v1(f.text, e.meaning)
FROM (SELECT DISTINCT expression_id, user_id FROM public.learning_records) owners,
  public.expression_forms f
WHERE owners.expression_id = e.id AND f.expression_id = e.id;

DO $$ BEGIN
  IF EXISTS (SELECT e.user_id, e.semantic_key FROM public.expressions e
    JOIN public.expression_forms f ON f.expression_id = e.id
    GROUP BY e.user_id, e.semantic_key
    HAVING count(DISTINCT jsonb_build_array(f.normalized_text, e.normalized_meaning)) > 1) THEN
    RAISE EXCEPTION 'Expression identity collision needs review';
  END IF;
END $$;

-- Preserve all historical IDs and references; only the earliest representative holds the key.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, semantic_key ORDER BY created_at, id) AS position
  FROM public.expressions
)
UPDATE public.expressions e SET semantic_key = NULL FROM ranked r
WHERE e.id = r.id AND r.position > 1;

ALTER TABLE public.expressions ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN normalized_meaning SET NOT NULL,
  ADD CONSTRAINT expressions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT expressions_user_semantic_key UNIQUE (user_id, semantic_key),
  ADD CONSTRAINT expressions_normalized_meaning_check
    CHECK (normalized_meaning = public.epp_normalize_v1(meaning)),
  ADD CONSTRAINT expressions_semantic_key_check CHECK (semantic_key ~ '^[0-9a-f]{64}$');
ALTER TABLE public.expression_forms ALTER COLUMN normalized_text SET NOT NULL,
  ADD CONSTRAINT expression_forms_normalized_text_check
    CHECK (normalized_text = public.epp_normalize_v1(text));
CREATE INDEX expression_forms_expression_id_idx ON public.expression_forms(expression_id);
COMMIT;
