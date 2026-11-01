-- Side 17A: read-only synthetic inputs, not tables to add to the EPP model.
WITH captures(id) AS (VALUES (1), (2)),
tags(capture_id, tag) AS (VALUES (1, 'work'), (1, 'daily')),
notes(capture_id, note_id) AS (VALUES (1, 11), (1, 12), (1, 13), (2, 21))
SELECT c.id, t.tag, n.note_id
FROM captures AS c
LEFT JOIN tags AS t ON t.capture_id = c.id
LEFT JOIN notes AS n ON n.capture_id = c.id
ORDER BY c.id, t.tag, n.note_id;

WITH captures(id) AS (VALUES (1), (2)),
tags(capture_id, tag) AS (VALUES (1, 'work'), (1, 'daily')),
notes(capture_id, note_id) AS (VALUES (1, 11), (1, 12), (1, 13), (2, 21))
SELECT c.id, count(t.tag) AS wrong_tag_count, count(n.note_id) AS wrong_note_count
FROM captures AS c
LEFT JOIN tags AS t ON t.capture_id = c.id
LEFT JOIN notes AS n ON n.capture_id = c.id
GROUP BY c.id
ORDER BY c.id;

WITH captures(id) AS (VALUES (1), (2)),
tags(capture_id, tag) AS (VALUES (1, 'work'), (1, 'daily')),
notes(capture_id, note_id) AS (VALUES (1, 11), (1, 12), (1, 13), (2, 21)),
tag_counts AS (
  SELECT capture_id, count(*) AS n FROM tags GROUP BY capture_id
),
note_counts AS (
  SELECT capture_id, count(*) AS n FROM notes GROUP BY capture_id
)
SELECT c.id, coalesce(t.n, 0) AS tag_count, coalesce(n.n, 0) AS note_count
FROM captures AS c
LEFT JOIN tag_counts AS t ON t.capture_id = c.id
LEFT JOIN note_counts AS n ON n.capture_id = c.id
ORDER BY c.id;

-- Unknown is not false: WHERE requires true.
SELECT 42 AS missing_id
WHERE 42 NOT IN (SELECT id FROM (VALUES (1), (NULL::integer)) AS other(id));

SELECT 42 AS missing_id
WHERE NOT EXISTS (
  SELECT 1 FROM (VALUES (1), (NULL::integer)) AS other(id) WHERE other.id = 42
);
