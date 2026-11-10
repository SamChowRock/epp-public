-- Run each SELECT separately in the intended VERIFY. Replace the UUID with
-- the account you read from GET /profile/me. These queries never fetch a signed URL.
SELECT current_database(), to_regclass('public.avatar_writes') AS writes_table;

-- Valid before and after migration. Check the same row, including old null values.
SELECT id, status, web_enabled, nickname, nickname_visible, created_at
FROM public.users WHERE id = 'REPLACE_WITH_USER_ID'::uuid;

-- After migration. LEFT JOIN preserves a user who never uploaded a file.
SELECT u.id AS owner_id, u.avatar_visible, u.avatar_id AS current_id,
       w.id AS attempt_id, w.state, w.created_at, w.check_after,
       (w.id IS NOT NULL AND w.id = u.avatar_id) IS TRUE AS is_current
FROM public.users u
LEFT JOIN public.avatar_writes w ON w.user_id = u.id
WHERE u.id = 'REPLACE_WITH_USER_ID'::uuid
ORDER BY w.created_at DESC, w.id DESC;
