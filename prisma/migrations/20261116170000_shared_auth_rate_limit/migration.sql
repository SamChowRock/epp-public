CREATE TABLE public.auth_rate_buckets (
  rule_key varchar(64) NOT NULL,
  source_key varchar(128) NOT NULL,
  opened_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  used integer NOT NULL,
  CONSTRAINT auth_rate_buckets_pkey PRIMARY KEY (rule_key, source_key),
  CONSTRAINT auth_rate_buckets_used_check CHECK (used BETWEEN 1 AND 10),
  CONSTRAINT auth_rate_buckets_window_check CHECK (expires_at = opened_at + interval '60 seconds')
);
