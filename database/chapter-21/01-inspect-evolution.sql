-- 在 DBeaver 的 DEV 或 VERIFY 连接执行；先确认身份，再看结构、历史和数据。
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SELECT conname, convalidated, conenforced, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.captures'::regclass AND contype = 'c'
ORDER BY conname;
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM public._prisma_migrations ORDER BY started_at;
SET TIME ZONE 'UTC';
SELECT id, user_id, original_text, chinese_intent,
       created_at, extract(epoch FROM created_at) AS epoch_seconds,
       char_length(chinese_intent) AS code_points,
       octet_length(chinese_intent) AS utf8_bytes
FROM public.captures ORDER BY id;
-- 这只审查 DB 的新规则。UTF-16 与全部空白仍需用应用规则单独核对。
SELECT id
FROM public.captures
WHERE chinese_intent IS NOT NULL AND (
  char_length(chinese_intent) NOT BETWEEN 1 AND 2000
  OR btrim(chinese_intent) = ''
);
