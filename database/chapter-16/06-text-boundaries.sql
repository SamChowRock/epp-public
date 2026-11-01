-- Read-only observations for side track 16A. No business rows are changed.
SELECT label, char_length(value) AS characters, octet_length(value) AS utf8_bytes
FROM (VALUES
  ('ASCII', 'A'),
  ('CJK', '中'),
  ('supplementary', '😀'),
  ('combining', U&'e\0301')
) AS samples(label, value);

SELECT char_length(repeat('😀', 1001)) AS postgres_characters;

SELECT label, value IS NULL AS is_null,
       char_length(value) > 0 AS nonempty_check
FROM (VALUES ('missing', NULL::text), ('empty', ''), ('space', ' '))
  AS samples(label, value);

SELECT char_length(btrim(E'\t')) AS tab_after_btrim,
       char_length(btrim(' ')) AS space_after_btrim;

SELECT 'abcdef'::varchar(3) AS explicit_cast_truncates;
