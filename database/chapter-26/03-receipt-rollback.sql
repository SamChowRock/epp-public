-- Isolated practice database only, fabricated pending candidate only.
-- Replace operation_id before executing; never run the whole file at once.
ALTER TABLE public.command_receipts ADD CONSTRAINT chapter26_reject_receipt
CHECK (operation_id <> '00000000-0000-4000-8000-000000000000'::uuid) NOT VALID;
-- Postman sends that operation: receipt INSERT fails, the entire acceptance rolls back.
-- Query candidate/learning_records/command_receipts with 01-inspect.sql before continuing.
ALTER TABLE public.command_receipts DROP CONSTRAINT chapter26_reject_receipt;
-- Resend the same candidate and operation; expect one complete success.
