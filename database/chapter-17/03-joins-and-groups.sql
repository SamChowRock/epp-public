-- Temporary fixture rows inside one transaction. End with ROLLBACK.
BEGIN;
SET LOCAL lock_timeout = '3s';

INSERT INTO public.users (id) VALUES
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
INSERT INTO public.captures (id, user_id, original_text, created_at)
VALUES ('40000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002',
        'This is my second workspace.', '2026-11-01T08:00:00.000Z');

SELECT c.id, c.original_text, u.id AS owner_id,
       u.created_at AS owner_created_at
FROM public.captures AS c
JOIN public.users AS u ON u.id = c.user_id
WHERE c.user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY c.created_at, c.id;

SELECT u.id AS owner_id, c.id AS capture_id
FROM public.users AS u
LEFT JOIN public.captures AS c ON c.user_id = u.id
WHERE u.id IN ('10000000-0000-4000-8000-000000000001',
               '10000000-0000-4000-8000-000000000002',
               '10000000-0000-4000-8000-000000000003')
ORDER BY u.id, c.id;

SELECT u.id, count(*) AS joined_rows, count(c.id) AS capture_count
FROM public.users AS u
LEFT JOIN public.captures AS c ON c.user_id = u.id
WHERE u.id IN ('10000000-0000-4000-8000-000000000001',
               '10000000-0000-4000-8000-000000000002',
               '10000000-0000-4000-8000-000000000003')
GROUP BY u.id
ORDER BY u.id;

-- Filter ON: keep all three users, count only matching captures.
SELECT u.id, count(c.id) AS matching_count
FROM public.users AS u
LEFT JOIN public.captures AS c
  ON c.user_id = u.id AND strpos(c.original_text, 'cook') > 0
WHERE u.id IN ('10000000-0000-4000-8000-000000000001',
               '10000000-0000-4000-8000-000000000002',
               '10000000-0000-4000-8000-000000000003')
GROUP BY u.id
ORDER BY u.id;

-- Filter WHERE: the null-extended rows do not survive this predicate.
SELECT u.id, count(c.id) AS matching_count
FROM public.users AS u
LEFT JOIN public.captures AS c ON c.user_id = u.id
WHERE u.id IN ('10000000-0000-4000-8000-000000000001',
               '10000000-0000-4000-8000-000000000002',
               '10000000-0000-4000-8000-000000000003')
  AND strpos(c.original_text, 'cook') > 0
GROUP BY u.id
ORDER BY u.id;

SELECT user_id, count(*) AS capture_count
FROM public.captures
WHERE user_id IN ('10000000-0000-4000-8000-000000000001',
                  '10000000-0000-4000-8000-000000000002',
                  '10000000-0000-4000-8000-000000000003')
GROUP BY user_id
HAVING count(*) >= 2
ORDER BY user_id;

SELECT u.id
FROM public.users AS u
WHERE u.id IN ('10000000-0000-4000-8000-000000000001',
               '10000000-0000-4000-8000-000000000002',
               '10000000-0000-4000-8000-000000000003')
  AND NOT EXISTS (SELECT 1 FROM public.captures AS c WHERE c.user_id = u.id)
ORDER BY u.id;

ROLLBACK;
