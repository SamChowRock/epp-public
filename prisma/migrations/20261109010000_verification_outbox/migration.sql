BEGIN;
SET LOCAL lock_timeout = '2s';
CREATE TABLE public.verification_outbox (
  id uuid PRIMARY KEY,
  intent_id uuid NOT NULL,
  generation text NOT NULL UNIQUE CHECK (generation ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('register', 'reset')),
  recipient text NOT NULL CHECK (recipient = lower(recipient) AND length(recipient) BETWEEN 3 AND 254),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'attempting', 'accepted', 'unknown', 'obsolete')),
  available_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX verification_outbox_ready_idx ON public.verification_outbox(status, available_at, id);
COMMIT;
