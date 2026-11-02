-- DBeaver: epp_dev / epp_owner. Read-only; do not overwrite earlier records.
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SET TIME ZONE 'UTC';
SELECT id, user_id, original_text, char_length(original_text) AS characters,
       created_at::text AS server_time
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY created_at, id;

-- Equivalent of q = '%' (a literal percent sign, not a wildcard).
PREPARE ch19_list(uuid, text, integer) AS
SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = $1 AND strpos(original_text COLLATE "C", $2) > 0
ORDER BY created_at, id
LIMIT $3;
EXECUTE ch19_list('10000000-0000-4000-8000-000000000001', '%', 10);
DEALLOCATE ch19_list;

-- Cross-check real time, not only Prisma write/read self-consistency.
SELECT created_at::text AS server_text,
       extract(epoch FROM created_at)::text AS epoch_seconds
FROM public.captures
WHERE id = '20000000-0000-4000-8000-000000000001';

-- Compact display used in the chapter screenshot; id_tail is not an identifier.
SELECT right(id::text, 4) AS id_tail,
       original_text, char_length(original_text) AS chars,
       to_char(created_at AT TIME ZONE 'UTC',
               'YYYY-MM-DD HH24:MI:SS.MS') AS utc_time
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY created_at, id;
