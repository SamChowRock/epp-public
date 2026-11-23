WITH expected(id, original_text) AS (
  VALUES (101, 'cook'), (102, 'cook'), (103, 'tea')
), received(id, original_text) AS (
  VALUES (101, 'cook'), (102, 'cook'), (102, 'cook')
), missing AS (
  SELECT id, original_text FROM expected
  EXCEPT ALL
  SELECT id, original_text FROM received
), extra AS (
  SELECT id, original_text FROM received
  EXCEPT ALL
  SELECT id, original_text FROM expected
)
SELECT 'missing' AS side, id, original_text FROM missing
UNION ALL
SELECT 'extra' AS side, id, original_text FROM extra
ORDER BY side, id;

WITH expected(pos, id) AS (
  VALUES (1, 101), (2, 102), (3, 103)
), received AS (
  SELECT pos, (item->>'id')::integer AS id
  FROM jsonb_array_elements('[{"id":102},{"id":101},{"id":103}]'::jsonb)
       WITH ORDINALITY AS entries(item, pos)
)
SELECT coalesce(e.pos, r.pos) AS pos, e.id AS expected_id, r.id AS received_id
FROM expected AS e
FULL JOIN received AS r ON r.pos = e.pos
WHERE e.id IS DISTINCT FROM r.id
ORDER BY pos;

-- Run on the chapter development data. Replace only the synthetic sample as described.
WITH expected AS (
  SELECT row_number() OVER (ORDER BY created_at, id) AS pos,
         id::text AS id, original_text
  FROM public.captures
  WHERE user_id = '10000000-0000-4000-8000-000000000001'
    AND strpos(original_text COLLATE "C", 'cook') > 0
  ORDER BY created_at, id
  LIMIT 2
), received AS (
  SELECT pos, item->>'id' AS id, item->>'originalText' AS original_text
  FROM jsonb_array_elements($sample$[
    {"id":"20000000-0000-4000-8000-000000000001","originalText":"  I am not much of a cook.  "},
    {"id":"20000000-0000-4000-8000-000000000002","originalText":"I'm learning to cook."}
  ]$sample$::jsonb) WITH ORDINALITY AS entries(item, pos)
)
SELECT coalesce(e.pos, r.pos) AS pos,
       e.id AS expected_id, r.id AS received_id,
       e.original_text AS expected_text, r.original_text AS received_text
FROM expected AS e
FULL JOIN received AS r ON r.pos = e.pos
WHERE e.pos IS NULL OR r.pos IS NULL
   OR e.id IS DISTINCT FROM r.id
   OR e.original_text IS DISTINCT FROM r.original_text
ORDER BY pos;
