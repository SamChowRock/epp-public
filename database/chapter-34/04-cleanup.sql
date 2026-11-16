-- 同一SQL会话；只清理映射到的本轮素材。若被用于采纳等实践，外键拒绝并整体回滚。
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM ch34_samples s JOIN captures c ON c.id=s.id AND c.user_id=s.user_id) <> 105
  THEN RAISE EXCEPTION 'Sample ownership/count changed; inspect instead of broad deletion'; END IF;
END $$;
DELETE FROM capture_revisions r USING ch34_samples s, captures c
WHERE r.capture_id=s.id AND c.id=s.id AND c.user_id=s.user_id;
DELETE FROM captures c USING ch34_samples s WHERE c.id=s.id AND c.user_id=s.user_id;
DROP TABLE ch34_samples;
DROP TABLE ch34_run;
COMMIT;
