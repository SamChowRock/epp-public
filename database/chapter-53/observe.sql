-- Replace both UUIDs with your recorded user and operation. Keep one row
-- even when the account exists but that operation has no receipt yet.
SELECT current_database() AS db, u.id, u.status, u.web_enabled AS web_now,
       r.operation_id, r.before_enabled, r.requested_enabled, r.account_status,
       r.db_actor, r.recorded_at
FROM public.users AS u
LEFT JOIN public.web_access_receipts AS r
  ON r.user_id = u.id AND r.operation_id = '替换为本次操作ID'::uuid
WHERE u.id = '替换为本次账号ID'::uuid;
