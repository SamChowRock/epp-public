-- Read-only; render bounds as UTC text independent of the DBeaver session zone.
WITH days(zone, day) AS (VALUES
 ('Asia/Shanghai', DATE '2026-11-05'),
 ('America/New_York', DATE '2026-03-08'),
 ('America/New_York', DATE '2026-11-01')),
 bounds AS (SELECT zone, day,
 day::timestamp AT TIME ZONE zone AS start_at,
 (day + 1)::timestamp AT TIME ZONE zone AS end_at FROM days)
SELECT zone, day,
 to_char(start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS from_utc,
 to_char(end_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS to_utc,
 extract(epoch FROM end_at-start_at)/3600 AS hours FROM bounds;

WITH bounds AS (SELECT
 timestamp '2026-11-05 00:00' AT TIME ZONE 'Asia/Shanghai' AS start_at,
 timestamp '2026-11-06 00:00' AT TIME ZONE 'Asia/Shanghai' AS end_at),
 samples(label, at) AS (VALUES
 ('before', timestamptz '2026-11-04 15:59:59.999+00'),
 ('start', timestamptz '2026-11-04 16:00:00+00'),
 ('last millisecond', timestamptz '2026-11-05 15:59:59.999+00'),
 ('next day', timestamptz '2026-11-05 16:00:00+00'))
SELECT label, to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS utc,
 at >= start_at AND at < end_at AS included FROM samples CROSS JOIN bounds ORDER BY at;
