-- Run in an otherwise idle session; local display changes end with ROLLBACK.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT id, created_at, created_at::text AS server_text,
       extract(epoch FROM created_at) AS epoch_seconds
FROM public.captures WHERE id = '20000000-0000-4000-8000-000000000001';

SET LOCAL TIME ZONE 'Asia/Shanghai';
SELECT id, created_at, created_at::text AS server_text,
       extract(epoch FROM created_at) AS epoch_seconds
FROM public.captures WHERE id = '20000000-0000-4000-8000-000000000001';

SELECT TIMESTAMPTZ '2026-10-31 08:00:00.123+00'
     = TIMESTAMPTZ '2026-10-31 16:00:00.123+08' AS same_instant;

SELECT TIMESTAMPTZ '2026-10-31 08:00:00.123+00' AT TIME ZONE 'UTC'
         AS utc_wall_time,
       TIMESTAMPTZ '2026-10-31 08:00:00.123+00' AT TIME ZONE 'Asia/Shanghai'
         AS shanghai_wall_time;
ROLLBACK;
SHOW TimeZone;
