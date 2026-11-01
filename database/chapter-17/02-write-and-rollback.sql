-- Execute statement by statement; rollback on error in this same session.
-- Do not change the two chapter-16 fixture records.
BEGIN;
SET LOCAL lock_timeout = '3s';

INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001', 'A temporary draft.')
RETURNING id, original_text, created_at;

UPDATE public.captures
SET original_text = 'A corrected draft.'
WHERE id = '40000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000001'
RETURNING id, original_text;

DELETE FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000002'
RETURNING id;

DELETE FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000001'
RETURNING id, original_text;

ROLLBACK;

SELECT id FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000001';
