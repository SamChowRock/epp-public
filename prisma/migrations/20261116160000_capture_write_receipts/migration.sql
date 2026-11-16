BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE TABLE public.capture_write_receipts (
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create-capture/v1', 'append-revision/v1')),
  operation_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  status_code integer NOT NULL CHECK (status_code = 201),
  location text,
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  recorded_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT capture_write_receipts_pkey PRIMARY KEY (user_id, action, operation_id),
  CONSTRAINT capture_write_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT capture_write_receipts_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES public.captures(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT capture_write_receipts_location_check CHECK (
    (action = 'create-capture/v1' AND location IS NOT NULL AND location = '/captures/' || capture_id::text)
    OR (action = 'append-revision/v1' AND location IS NULL))
);
CREATE INDEX capture_write_receipts_capture_id_idx ON public.capture_write_receipts(capture_id);

COMMIT;
