-- 先接受新列表第一页并保存cursor，再执行本脚本，最后用原cursor读下一页。
-- #0在边界之前变成匹配，续页漏看；#102在边界之后变成匹配，将在后面出现。
-- 只给本轮两条已核对的记录追加，不更新或删除初始修订。再次执行会拒绝。
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM ch34_samples s JOIN captures c ON c.id=s.id AND c.user_id=s.user_id
      WHERE s.n IN (0,102)) <> 2
    OR EXISTS (SELECT FROM ch34_samples s JOIN capture_revisions r ON r.capture_id=s.id
      WHERE s.n IN (0,102) AND r.revision_no > 2)
  THEN RAISE EXCEPTION 'Expected exactly two unchanged run targets'; END IF;
END $$;
INSERT INTO capture_revisions(id, capture_id, revision_no, original_text, input_source)
SELECT gen_random_uuid(), s.id, 3, 'ch34-match:' || s.run_id || ' newly matching #' || s.n, 'manual'
FROM ch34_samples s JOIN captures c ON c.id=s.id AND c.user_id=s.user_id WHERE s.n IN (0,102);
COMMIT;
-- 从头重读有103条；从之前边界续读不会补回#0。实时分页不是精确导出快照。
