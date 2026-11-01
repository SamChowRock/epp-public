-- Read-only. Keep the chapter-16 schema and fixtures.
SELECT current_database(), current_user, inet_server_addr(), inet_server_port(),
       pg_backend_pid(), current_setting('transaction_isolation');

SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY created_at ASC, id ASC;

SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001'
  AND strpos(original_text, 'cook') > 0
ORDER BY created_at ASC, id ASC
LIMIT 1 OFFSET 1;

SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001'
  AND id = '20000000-0000-4000-8000-000000000002';

-- These filters preserve literal substring semantics, including % and _.
SELECT strpos('100% ready', '%') AS literal_percent,
       strpos('a_b', '_') AS literal_underscore,
       strpos('Cook', 'cook') AS case_sensitive;
