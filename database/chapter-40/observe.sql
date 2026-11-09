SELECT current_database();
-- Latest tickets in an isolated VERIFY database. Keep credentials out of the result.
SELECT right(scene::text, 6) AS display_code,status,user_id,
       expires_at <= clock_timestamp() AS expired
FROM public.browser_login_tickets ORDER BY expires_at DESC LIMIT 10;

-- Replace the UUID with the lab's userId. Count each relation separately.
SELECT u.id, u.web_enabled, u.mini_enabled,
 (SELECT count(*) FROM public.sessions s WHERE s.user_id=u.id AND s.channel='web'
      AND s.expires_at>clock_timestamp()) AS active_web,
 (SELECT count(*) FROM public.captures c WHERE c.user_id=u.id) AS captures
FROM public.users u WHERE u.id='00000000-0000-0000-0000-000000000000'::uuid;
