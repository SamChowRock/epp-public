SELECT current_database();

-- Replace the sample UUID with the userId printed by this lab, or with the pending userId.
SELECT u.id, u.status, u.web_enabled, u.mini_enabled,
       (SELECT count(*) FROM public.wechat_identities w WHERE w.user_id = u.id) AS mappings,
       (SELECT count(*) FROM public.sessions s WHERE s.user_id = u.id AND s.channel = 'web'
          AND s.expires_at > clock_timestamp()) AS web_sessions,
       (SELECT count(*) FROM public.captures c WHERE c.user_id = u.id) AS captures
FROM public.users u WHERE u.id = '00000000-0000-0000-0000-000000000000'::uuid;
