-- Read-only experiment: filtering before/after choosing the latest revision differs.
WITH revisions(capture_id, revision_no, original_text) AS (
  VALUES ('A', 1, 'I am not much of cook.'),
         ('A', 2, 'Cooking is not my strength.')
)
SELECT * FROM revisions WHERE strpos(original_text, 'cook.') > 0;
-- Returns historical version 1: suitable for a historical search, not current content.
WITH revisions(capture_id, revision_no, original_text) AS (
  VALUES ('A', 1, 'I am not much of cook.'),
         ('A', 2, 'Cooking is not my strength.')
), latest AS (
  SELECT * FROM revisions ORDER BY revision_no DESC LIMIT 1
)
SELECT * FROM latest WHERE strpos(original_text, 'cook.') > 0;
-- Returns no rows: the current version no longer contains this literal substring.
