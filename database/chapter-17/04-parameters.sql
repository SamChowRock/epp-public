-- Execute in ONE session; prepared statements are session-scoped.
-- On rerun after an interrupted run, inspect pg_prepared_statements first.
PREPARE epp17_list (uuid, text, integer, integer) AS
SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = $1
  AND ($2 IS NULL OR strpos(original_text, $2) > 0)
ORDER BY created_at ASC, id ASC
LIMIT $3 OFFSET $4;

EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', 'cook', 1, 0);
EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', 'cook', 1, 1);
EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', '%', 10, 0);
EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', ''' OR true --', 10, 0);
EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', NULL, NULL, 0);

DEALLOCATE epp17_list;
