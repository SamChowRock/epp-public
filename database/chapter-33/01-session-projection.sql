-- Safety projection: deliberately excludes token_digest and password_hash.
SELECT id, user_id, label, created_at, expires_at,
       expires_at > clock_timestamp() AS usable_now
FROM public.sessions
ORDER BY created_at DESC, id DESC;

SELECT u.id,
  (SELECT count(*) FROM public.captures c WHERE c.user_id = u.id) AS captures,
  (SELECT count(*) FROM public.learning_records r WHERE r.user_id = u.id) AS learning_records,
  EXISTS (SELECT 1 FROM public.password_credentials p WHERE p.user_id = u.id) AS has_password
FROM public.users u ORDER BY u.id;
