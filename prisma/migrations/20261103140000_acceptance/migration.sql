BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

ALTER TABLE public.candidates ADD COLUMN accepted_at timestamptz(3);
ALTER TABLE public.candidates DROP CONSTRAINT candidates_state_shape;
ALTER TABLE public.candidates ADD CONSTRAINT candidates_state_shape CHECK (
  (status = 'pending' AND discarded_at IS NULL AND accepted_at IS NULL) OR
  (status = 'discarded' AND discarded_at IS NOT NULL AND accepted_at IS NULL) OR
  (status = 'accepted' AND discarded_at IS NULL AND accepted_at IS NOT NULL)
);
CREATE TABLE public.expressions (
  id uuid CONSTRAINT expressions_pkey PRIMARY KEY,
  meaning text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT expressions_meaning_shape CHECK (char_length(meaning) BETWEEN 1 AND 2000 AND btrim(meaning) <> '')
);
CREATE TABLE public.expression_forms (
  id uuid CONSTRAINT expression_forms_pkey PRIMARY KEY,
  expression_id uuid NOT NULL,
  text text NOT NULL,
  CONSTRAINT expression_forms_expression_id_fkey FOREIGN KEY (expression_id)
    REFERENCES public.expressions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT expression_forms_text_shape CHECK (char_length(text) BETWEEN 1 AND 2000 AND btrim(text) <> '')
);
CREATE TABLE public.learning_records (
  id uuid CONSTRAINT learning_records_pkey PRIMARY KEY,
  user_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  expression_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT learning_records_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT learning_records_candidate_id_fkey FOREIGN KEY (candidate_id)
    REFERENCES public.candidates(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT learning_records_expression_id_fkey FOREIGN KEY (expression_id)
    REFERENCES public.expressions(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
COMMIT;
