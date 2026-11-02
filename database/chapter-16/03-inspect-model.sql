SELECT current_database(), current_user, inet_server_addr(), inet_server_port();

SELECT table_name, column_name, data_type, udt_name,
       is_nullable, column_default, datetime_precision
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('users', 'captures')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS table_name, conname,
       convalidated, conenforced,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.users'::regclass, 'public.captures'::regclass)
ORDER BY table_name, conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('users', 'captures')
ORDER BY tablename, indexname;

SELECT id, created_at FROM public.users ORDER BY id;

SELECT id, user_id, original_text, created_at,
       char_length(original_text) AS character_count
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY created_at, id;
