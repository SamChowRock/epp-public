-- Compare before/after baseline in epp_dev. No mutation.
SET TIME ZONE 'UTC';
SELECT current_database(), current_user;
SELECT id, created_at FROM public.users ORDER BY id;
SELECT id, user_id, original_text, char_length(original_text) AS characters,
       created_at
FROM public.captures
ORDER BY created_at, id;
