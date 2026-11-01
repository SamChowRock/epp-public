-- Development fixtures only. Explicit IDs let a retry fail instead of duplicating data.
-- Inspect existing rows after an uncertain result; do not delete or upsert them.
BEGIN;

INSERT INTO public.users (id)
VALUES ('10000000-0000-4000-8000-000000000001');

INSERT INTO public.captures (id, user_id, original_text, created_at)
VALUES
  ('20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   '  I am not much of a cook.  ',
   '2026-10-31T08:00:00.123Z'),
  ('20000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000001',
   'I''m learning to cook.',
   '2026-10-31T08:00:00.123Z');

COMMIT;
