BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE TABLE public.password_credentials (
  user_id uuid NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT password_credentials_pkey PRIMARY KEY (user_id),
  CONSTRAINT password_credentials_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

COMMIT;
