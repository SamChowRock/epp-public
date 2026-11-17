-- DBeaver: replace each all-zero UUID with the specific synthetic practice object's ID.
-- Query each selected object independently. Never select token_digest, generation or password_hash.
SELECT current_database(), current_user;
SELECT id, status, web_enabled, mini_enabled FROM public.users
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
SELECT id, user_id, original_text, chinese_intent, created_at FROM public.captures
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
SELECT id, capture_id, revision_no, original_text, chinese_intent, created_at
FROM public.capture_revisions WHERE capture_id = '00000000-0000-0000-0000-000000000000'::uuid
ORDER BY revision_no;
SELECT id, user_id, label, channel, created_at, expires_at FROM public.sessions
WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid ORDER BY channel, id;
SELECT app_id, user_id, created_at FROM public.wechat_identities
WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid;
SELECT id, purpose, email, user_id, credential_version, issued_at, expires_at, consumed_at
FROM public.verification_intents WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
SELECT id, intent_id, purpose, recipient, status, available_at FROM public.verification_outbox
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
-- Compare old migration rows before/after; current branch adds only the migration absent on your starting side.
SELECT migration_name, checksum, finished_at FROM public._prisma_migrations ORDER BY migration_name;
