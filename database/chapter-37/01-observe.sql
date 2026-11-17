SELECT current_database(), current_user;
-- Replace only with this round's two fixture IDs. Never select token_digest or open_id for screenshots.
WITH fixture(account, id) AS (VALUES
  ('original', '00000000-0000-4000-8000-000000000037'::uuid),
  ('other',    '00000000-0000-4000-8000-000000000038'::uuid)
)
SELECT current_database() AS db, f.account, u.status, u.web_enabled, u.mini_enabled,
       (SELECT count(*) FROM public.wechat_identities i WHERE i.user_id=u.id) AS platform_identities,
       (SELECT count(*) FROM public.captures c WHERE c.user_id=u.id) AS captures
FROM fixture f JOIN public.users u ON u.id = f.id
ORDER BY f.account;

SELECT current_database() AS db, channel, count(*) AS sessions,
       bool_and(expires_at > clock_timestamp()) AS all_unexpired
FROM public.sessions WHERE user_id = '00000000-0000-4000-8000-000000000037'
GROUP BY channel ORDER BY channel;
