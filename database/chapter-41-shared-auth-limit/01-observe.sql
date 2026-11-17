-- Connect only to the isolated chapter-41 verification DB; no user/password/session secrets.
SELECT current_database(), current_user, current_setting('server_encoding'), clock_timestamp();
SELECT rule_key, source_key, opened_at, expires_at, used,
       greatest(0, ceil(extract(epoch FROM expires_at - clock_timestamp()))) AS seconds_left
FROM public.auth_rate_buckets WHERE rule_key = 'password-auth/v1'
ORDER BY opened_at, source_key;
SELECT count(*) AS physical_rows FROM public.auth_rate_buckets WHERE rule_key = 'password-auth/v1';
