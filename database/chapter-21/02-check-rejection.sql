-- 同一编辑器逐段执行；只改自己记录的实验 ID，不操作他人的记录。
-- 开始前把下面 ID 换成 Postman 本章新建记录的 ID；保持原值不变则会更新零行。
BEGIN;
UPDATE public.captures
SET chinese_intent = repeat('长', 2001)
WHERE id = '00000000-0000-4000-8000-000000000000'::uuid;
-- 命中存在的实验行时应失败 23514，约束 captures_chinese_intent_shape。
-- 发生错误后单独执行：
ROLLBACK;
