SELECT current_database(), current_user;
-- Replace the sample UUID with the LOCAL account id, never the provider subject.
SELECT current_database() AS db, u.web_enabled, u.status,
       (SELECT count(*) FROM public.oidc_identities i WHERE i.user_id=u.id) AS external_ids,
       (SELECT count(*) FROM public.captures c WHERE c.user_id=u.id) AS captures,
       (SELECT count(*) FROM public.sessions s WHERE s.user_id=u.id AND s.channel='web'
         AND s.expires_at > clock_timestamp()) AS live_web_sessions
FROM public.users u WHERE u.id='00000000-0000-4000-8000-000000000038';
