WITH captures(owner_id, id, minute_no) AS (
  VALUES ('A', 101, 8), ('A', 102, 9), ('A', 103, 9), ('A', 104, 10),
         ('B', 201, 9), ('B', 202, 9)
)
SELECT owner_id, id, minute_no,
       row_number() OVER (PARTITION BY owner_id ORDER BY minute_no DESC, id DESC) AS slot,
       rank() OVER (PARTITION BY owner_id ORDER BY minute_no DESC) AS place,
       dense_rank() OVER (PARTITION BY owner_id ORDER BY minute_no DESC) AS time_group
FROM captures
ORDER BY owner_id, minute_no DESC, id DESC;

WITH owners(owner_id) AS (VALUES ('A'), ('B'), ('C')),
captures(owner_id, id, minute_no) AS (
  VALUES ('A', 101, 8), ('A', 102, 9), ('A', 103, 9), ('A', 104, 10),
         ('B', 201, 9), ('B', 202, 9)
),
ranked AS (
  SELECT owner_id, id, minute_no,
         row_number() OVER (PARTITION BY owner_id ORDER BY minute_no DESC, id DESC) AS slot,
         rank() OVER (PARTITION BY owner_id ORDER BY minute_no DESC) AS place,
         dense_rank() OVER (PARTITION BY owner_id ORDER BY minute_no DESC) AS time_group
  FROM captures
)
SELECT o.owner_id, r.id, r.minute_no, r.slot
FROM owners AS o
LEFT JOIN ranked AS r ON r.owner_id = o.owner_id AND r.slot <= 2
ORDER BY o.owner_id, r.slot;

WITH captures(owner_id, id, minute_no) AS (
  VALUES ('A', 101, 8), ('A', 102, 9), ('A', 103, 9), ('A', 104, 10),
         ('B', 201, 9), ('B', 202, 9)
)
SELECT owner_id, id, minute_no,
       count(*) OVER (PARTITION BY owner_id) AS owner_total,
       count(*) OVER (PARTITION BY owner_id ORDER BY minute_no) AS through_minute,
       count(*) OVER (PARTITION BY owner_id ORDER BY minute_no, id
                      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS through_row
FROM captures
ORDER BY owner_id, minute_no, id;
