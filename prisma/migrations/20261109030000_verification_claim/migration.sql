BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.verification_outbox
  ADD COLUMN claim_id uuid,
  ADD COLUMN lease_until timestamptz(3),
  ADD CONSTRAINT verification_outbox_claim_pair CHECK (
    (claim_id IS NULL AND lease_until IS NULL) OR
    (claim_id IS NOT NULL AND lease_until IS NOT NULL AND status IN ('pending','attempting'))
  );
CREATE INDEX verification_outbox_pick_idx ON public.verification_outbox
  (COALESCE(lease_until, available_at), id) WHERE status = 'pending';
COMMIT;
