-- Run once as epp_owner in the verified epp_dev database.
-- Keep existing objects and data; an existing relation is a reason to inspect.
BEGIN;

CREATE TABLE public.users (
  id uuid CONSTRAINT users_pkey PRIMARY KEY,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.captures (
  id uuid CONSTRAINT captures_pkey PRIMARY KEY,
  user_id uuid NOT NULL,
  original_text text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT captures_original_text_nonempty CHECK (char_length(original_text) > 0),
  CONSTRAINT captures_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX captures_user_id_idx ON public.captures (user_id);

COMMIT;
