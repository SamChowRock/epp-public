ALTER TABLE public.password_credentials ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE public.password_credentials ADD CONSTRAINT password_credentials_version_check CHECK (version > 0);

CREATE TABLE public.verified_emails (
  email text CONSTRAINT verified_emails_pkey PRIMARY KEY,
  user_id uuid NOT NULL CONSTRAINT verified_emails_user_id_key UNIQUE,
  verified_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT verified_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT verified_emails_email_check CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254)
);
CREATE TABLE public.verification_intents (
  id uuid CONSTRAINT verification_intents_pkey PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('register', 'reset')),
  email text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  token_digest text NOT NULL CONSTRAINT verification_intents_token_digest_key UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  user_id uuid,
  credential_version integer,
  issued_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz(3) NOT NULL,
  consumed_at timestamptz(3),
  CONSTRAINT verification_intents_purpose_email_key UNIQUE (purpose, email),
  CONSTRAINT verification_intents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT verification_intents_binding_check CHECK (
    (user_id IS NULL AND credential_version IS NULL) OR
    (purpose = 'reset' AND user_id IS NOT NULL AND credential_version IS NOT NULL AND credential_version > 0)
  ),
  CONSTRAINT verification_intents_lifetime_check CHECK (expires_at > issued_at)
);
CREATE INDEX verification_intents_expires_at_idx ON public.verification_intents(expires_at);
