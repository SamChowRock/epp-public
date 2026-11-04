-- 迁移前执行。正常章节26历史：每个表达恰好一个形式、一个归属用户。
SELECT e.id,
  (SELECT count(*) FROM public.expression_forms f WHERE f.expression_id=e.id) AS forms,
  (SELECT count(DISTINCT l.user_id) FROM public.learning_records l WHERE l.expression_id=e.id) AS owners
FROM public.expressions e
WHERE (SELECT count(*) FROM public.expression_forms f WHERE f.expression_id=e.id) <> 1
  OR (SELECT count(DISTINCT l.user_id) FROM public.learning_records l WHERE l.expression_id=e.id) <> 1;

-- 迁移后：旧重复可以没有复用键，但引用仍完整；只查已保存的回执，不改JSON。
SELECT n.id AS candidate_id, n.status, r.revision_no,
  l.id AS learning_record_id,l.expression_id,
  count(q.operation_id) AS receipt_count
FROM public.candidates n JOIN public.capture_revisions r ON r.id=n.revision_id
LEFT JOIN public.learning_records l ON l.candidate_id=n.id
LEFT JOIN public.command_receipts q ON q.candidate_id=n.id
GROUP BY n.id,r.revision_no,l.id
ORDER BY n.id;
