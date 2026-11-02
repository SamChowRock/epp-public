-- DEV connection; execute the identity query before inspecting or changing data.
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SET TIME ZONE 'UTC';
SELECT id, user_id, original_text, chinese_intent,
       created_at::text AS created_at_utc, extract(epoch FROM created_at) AS epoch_seconds
FROM public.captures ORDER BY created_at, id;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='captures'
ORDER BY ordinal_position;
SELECT conname, contype, convalidated, conenforced, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid='public.captures'::regclass ORDER BY conname;
SELECT migration_name, finished_at IS NOT NULL AS finished,
       rolled_back_at IS NOT NULL AS rolled_back, checksum
FROM public._prisma_migrations ORDER BY started_at;
-- Compact view for comparing old and newly supplied intent in the result grid.
SELECT right(id::text, 4) AS id_tail, original_text, chinese_intent,
       to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS.MS') AS created_utc
FROM public.captures ORDER BY created_at,id;
