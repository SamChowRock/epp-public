-- Execute the identity query separately; compare source and restored databases.
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SELECT * FROM public.users ORDER BY id;
SELECT id, user_id, original_text, chinese_intent, created_at
FROM public.captures ORDER BY created_at, id;
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
FROM public._prisma_migrations ORDER BY migration_name, started_at;
SELECT conrelid::regclass AS relation, conname, pg_get_constraintdef(oid) AS definition,
       convalidated, conenforced
FROM pg_constraint WHERE conrelid IN ('public.users'::regclass, 'public.captures'::regclass)
ORDER BY conrelid::regclass::text, conname;
