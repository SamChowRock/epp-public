-- Safe fields only. Run on the intended VERIFY connection.
SELECT id, status, web_enabled, created_at
FROM public.users ORDER BY created_at, id;
