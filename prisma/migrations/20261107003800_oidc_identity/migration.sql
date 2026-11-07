CREATE TABLE public.oidc_identities (
  issuer text COLLATE "C" NOT NULL CHECK (octet_length(issuer) BETWEEN 1 AND 512),
  subject text COLLATE "C" NOT NULL CHECK (octet_length(subject) BETWEEN 1 AND 255),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (issuer, subject),
  UNIQUE (issuer, user_id)
);
