BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
CREATE TABLE public.command_receipts (
  user_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  action text NOT NULL,
  candidate_id uuid NOT NULL,
  fingerprint text NOT NULL,
  status_code integer NOT NULL,
  response jsonb NOT NULL,
  recorded_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT command_receipts_pkey PRIMARY KEY (user_id, operation_id),
  CONSTRAINT command_receipts_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT command_receipts_candidate_id_fkey FOREIGN KEY (candidate_id)
    REFERENCES public.candidates(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT command_receipts_action_check CHECK (action = 'accept-candidate/v1'),
  CONSTRAINT command_receipts_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT command_receipts_status_check CHECK (status_code = 201),
  CONSTRAINT command_receipts_response_check CHECK (jsonb_typeof(response) = 'object')
);
COMMIT;
