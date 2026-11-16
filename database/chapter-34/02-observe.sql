-- 与01同一SQL会话执行；完整有序ID用于比较，不能只比较计数。
SELECT s.n, c.id, c.created_at, latest.revision_no, latest.original_text
FROM ch34_samples s JOIN captures c ON c.id = s.id AND c.user_id = s.user_id
JOIN LATERAL (SELECT revision_no, original_text FROM capture_revisions
  WHERE capture_id = c.id ORDER BY revision_no DESC LIMIT 1) latest ON true
WHERE strpos(latest.original_text COLLATE "C", 'ch34-match:' || s.run_id) > 0
ORDER BY c.created_at, c.id;
-- 原始修订仍在；#104的第一版命中，最新版不命中，不能出现在列表。
SELECT s.n, r.revision_no, r.original_text FROM ch34_samples s
JOIN capture_revisions r ON r.capture_id = s.id WHERE s.n IN (0, 1, 102, 104)
ORDER BY s.n, r.revision_no;
