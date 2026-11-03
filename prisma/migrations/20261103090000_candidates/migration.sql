BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE TABLE public.candidates (
  id uuid CONSTRAINT candidates_pkey PRIMARY KEY,
  revision_id uuid NOT NULL,
  candidate_no integer NOT NULL,
  english_text text NOT NULL,
  chinese_meaning text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  discarded_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT candidates_revision_id_fkey FOREIGN KEY (revision_id)
    REFERENCES public.capture_revisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT candidates_revision_no_key UNIQUE (revision_id, candidate_no),
  CONSTRAINT candidates_no_range CHECK (candidate_no BETWEEN 1 AND 5),
  CONSTRAINT candidates_english_shape CHECK (char_length(english_text) BETWEEN 1 AND 2000 AND btrim(english_text) <> ''),
  CONSTRAINT candidates_meaning_shape CHECK (char_length(chinese_meaning) BETWEEN 1 AND 2000 AND btrim(chinese_meaning) <> ''),
  CONSTRAINT candidates_state_shape CHECK (
    (status = 'pending' AND discarded_at IS NULL) OR
    (status = 'discarded' AND discarded_at IS NOT NULL)
  )
);

COMMIT;
