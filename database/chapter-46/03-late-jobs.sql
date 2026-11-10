-- One statement, only in this disposable VERIFY copy. Save both event IDs.
WITH recipients AS (
  INSERT INTO public.users(id,status,web_enabled)
  SELECT gen_random_uuid(),s,false FROM (VALUES ('active'),('disabled')) v(s)
  WHERE current_database()='epp_ch46_verify'
  RETURNING id,status
)
INSERT INTO public.notification_jobs(id,user_id,kind,created_at,expires_at)
SELECT gen_random_uuid(),id,'registered',CURRENT_TIMESTAMP - interval '2 days',
       CASE WHEN status='active' THEN CURRENT_TIMESTAMP - interval '1 day'
            ELSE CURRENT_TIMESTAMP + interval '1 day' END
FROM recipients RETURNING id,user_id,created_at,expires_at;
