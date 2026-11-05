-- 在已核对的DEV或独立VERIFY连接执行；这些查询不修改数据。
SELECT current_database(), current_user;

-- 一行是一条学习来源，而非一个表达。用户条件必须进入查询。
SELECT l.id AS learning_id, l.created_at, e.id AS expression_id,
       e.meaning, c.id AS candidate_id, r.revision_no, r.original_text
FROM learning_records l
JOIN expressions e ON e.id = l.expression_id
JOIN candidates c ON c.id = l.candidate_id
JOIN capture_revisions r ON r.id = c.revision_id
JOIN captures p ON p.id = r.capture_id
WHERE l.user_id = '10000000-0000-4000-8000-000000000001'
  AND e.user_id = l.user_id AND p.user_id = l.user_id
ORDER BY l.created_at DESC, l.id DESC LIMIT 21;

-- 一行是一个表达身份，旧副本的NULL键不意味着应该隐藏。
SELECT e.id, e.meaning, e.semantic_key IS NOT NULL AS reusable,
       count(l.id) AS record_count
FROM expressions e
JOIN learning_records l ON l.expression_id = e.id
JOIN candidates c ON c.id = l.candidate_id
JOIN capture_revisions r ON r.id = c.revision_id
JOIN captures p ON p.id = r.capture_id
WHERE e.user_id = '10000000-0000-4000-8000-000000000001'
  AND l.user_id = e.user_id AND p.user_id = e.user_id
GROUP BY e.id ORDER BY e.created_at DESC, e.id DESC LIMIT 21;
