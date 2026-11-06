BEGIN;
CREATE TABLE public.sessions (
  id uuid CONSTRAINT sessions_pkey PRIMARY KEY,
  user_id uuid NOT NULL,
  token_digest text NOT NULL CONSTRAINT sessions_token_digest_key UNIQUE,
  label text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz(3) NOT NULL,
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT sessions_token_digest_format CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sessions_label_length CHECK (char_length(label) BETWEEN 1 AND 60),
  CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_id_expires_at_idx ON public.sessions(user_id, expires_at);
COMMIT;
