-- Only in the independent VERIFY database, after chapter 24 and before chapter 25.
-- Run the identity query separately and confirm the connection before continuing.
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();

BEGIN;
DO $$
BEGIN
  IF to_regclass('public.capture_revisions') IS NOT NULL THEN
    RAISE EXCEPTION 'Already upgraded: use the existing revision history';
  END IF;
END $$;

INSERT INTO public.users (id) VALUES ('10000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.captures (id, user_id, original_text, chinese_intent) VALUES
  ('22000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '  A quiet morning.  ', NULL),
  ('22000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Time for a walk.', '出去散步')
RETURNING id, user_id, original_text, chinese_intent, created_at;
COMMIT;
