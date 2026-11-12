-- Run on your isolated VERIFY connection. No token or password material is selected.
SELECT current_database(), current_user;
SELECT email, user_id, verified_at FROM public.verified_emails
WHERE email = 'reader36@example.test';
SELECT purpose, email, user_id IS NOT NULL AS account_bound,
       credential_version, issued_at, expires_at,
       consumed_at IS NOT NULL AS consumed,
       consumed_at IS NULL AND expires_at > clock_timestamp() AS time_eligible
FROM public.verification_intents WHERE email = 'reader36@example.test'
ORDER BY purpose;
SELECT current_database() AS database, e.email, u.status,
       u.web_enabled, p.version AS credential_version,
       count(s.id)::int AS sessions
FROM public.verified_emails e
JOIN public.users u ON u.id = e.user_id
JOIN public.password_credentials p ON p.user_id = u.id
LEFT JOIN public.sessions s ON s.user_id = u.id
WHERE e.email = 'reader36@example.test'
GROUP BY e.email, u.id, p.version;
-- Run while paused before SMTP; use a fresh fictional address for each demonstration.
SELECT current_database() AS database, purpose, email,
       consumed_at IS NOT NULL AS consumed,
       consumed_at IS NULL AND expires_at > clock_timestamp() AS time_eligible,
       EXISTS (SELECT 1 FROM public.verified_emails e WHERE e.email = i.email) AS has_account
FROM public.verification_intents i
WHERE email = 'debug36@example.test';
