-- 仅用于已备份的第66章独立合成库。替换两个 UUID，不要整体运行 inspect.sql。
BEGIN;
SET LOCAL lock_timeout = '2s';
DO $$
DECLARE
  recoverable uuid := '00000000-0000-4000-8000-000000000001';
  unproven uuid := '00000000-0000-4000-8000-000000000002';
BEGIN
  IF current_database() <> 'epp_ch66_source' THEN RAISE EXCEPTION 'Wrong exercise database'; END IF;
  IF recoverable = unproven OR
    (SELECT count(*) FROM public.captures WHERE (id=recoverable AND original_text='Chapter66 recoverable')
       OR (id=unproven AND original_text='Chapter66 unproven')) <> 2 THEN
    RAISE EXCEPTION 'Expected two explicitly selected synthetic captures';
  END IF;
  PERFORM 1 FROM public.captures WHERE id IN (recoverable,unproven) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.capture_revisions WHERE capture_id=recoverable) <> 2
     OR (SELECT count(*) FROM public.capture_revisions WHERE capture_id=unproven) <> 1 THEN
    RAISE EXCEPTION 'Expected two revisions and one revision; inspect rather than repeat injection';
  END IF;
  DELETE FROM public.capture_revisions WHERE capture_id IN (recoverable,unproven);
END $$;
COMMIT;
-- 如发生任何错误，先单独 ROLLBACK；保留外键，禁止 CASCADE 或清空其他表。
