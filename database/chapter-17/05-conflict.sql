-- DO NOTHING skips a conflict; it does not verify equal content.
BEGIN;
SET LOCAL lock_timeout = '3s';
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000001', 'First version.')
RETURNING id, original_text;

INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000001', 'Different content.')
ON CONFLICT (id) DO NOTHING
RETURNING id, original_text;

SELECT id, original_text FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000004';

-- Same text with another identity is allowed by the current business rule.
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000005',
        '10000000-0000-4000-8000-000000000001', 'First version.')
RETURNING id, original_text;
ROLLBACK;
