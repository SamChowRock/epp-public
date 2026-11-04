-- 两个连接应使用同一隔离校验库。A先执行整个BEGIN+SELECT，暂不COMMIT。
-- 文本和义项必须与即将采纳的pending候选完全对应。
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended(
  '["expression","10000000-0000-4000-8000-000000000001","' ||
  public.epp_identity_v1('Pause for a moment.','停一会儿') || '"]',0));
-- Postman发匹配的采纳会在单次等锁约1秒后503。B核对candidate仍pending、无新回执。
-- 单独执行以释放；然后Postman用相同operationId重试。
ROLLBACK;
