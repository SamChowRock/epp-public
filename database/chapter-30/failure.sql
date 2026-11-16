-- Isolated VERIFY database only. Keep the API stopped while changing constraints.
-- Replace this key in BOTH the constraint and the saved Postman request.
ALTER TABLE public.capture_write_receipts
ADD CONSTRAINT chapter30_reject_receipt
CHECK (operation_id <> '30000000-0000-4000-8000-000000000099'::uuid) NOT VALID;

-- Send one keyed create/append, then query: no business effect or receipt remains.
-- Execute separately, only after inspecting the failed request:
ALTER TABLE public.capture_write_receipts DROP CONSTRAINT chapter30_reject_receipt;
-- Retry the original key and original request; success can now commit atomically.
