# 第十七章：SQL 的结果、参数与事务边界

从 `part-03/chapter-16` 继续，当前分支为 `part-03/chapter-17`。使用上一章已经存在的 public.users／public.captures、固定用户与两条记录，不重建、不重复 seed。本章不改表结构、Nest 主服务、依赖或生产入口；新增文件均为独立实验，database 目录不进入应用构建。

## DBeaver 操作入口

连接第十五章的 `127.0.0.1:55432/epp_dev`，角色 epp_owner。先运行 `database/chapter-16/03-inspect-model.sql` 核对环境与原始数据。保持 Auto-commit、关闭 Smart commit，SQL Script 设置 No commit、Stop + rollback，启用查询结果抓取。脚本自己控制事务，不在事务中自动重连。

SQL 编辑器保存只保存文字；Execute SQL Statement 执行当前／选中语句；Execute SQL Script 顺序执行整份／选区。下面标为手动分阶段的文件只能逐阶段执行，不整份连跑。错误发生后在原编辑器、原连接执行 ROLLBACK，再诊断。

| 文件 | 执行方式 | 观察与结束状态 |
| --- | --- | --- |
| 01-read.sql | 只读，可反复执行 | 连接与 PID；两条记录按 created_at/id 升序；cook 第二页为 002；字面搜索对照 4、2、0 |
| 02-write-and-rollback.sql | 同会话逐条观察，最后回滚 | 实验记录插入、更新各一行；错误拥有者删除零行，正确拥有者删除一行；无新数据保留 |
| 03-joins-and-groups.sql | BEGIN、两段 INSERT 后逐条查询，最后回滚 | 加入两个临时用户／一条记录；LEFT JOIN 四行；count(*) 为 2、1、1，count(c.id) 为 2、1、0；HAVING 只剩 001，NOT EXISTS 为 003 |
| 04-parameters.sql | 同会话执行 PREPARE、各 EXECUTE、DEALLOCATE | 前两次分别 001、002；百分号／引号输入为零行；无筛选与无上限为两行 |
| 05-conflict.sql | 事务内对照后回滚 | 冲突被跳过但内容未更新；同内容新 ID 仍能插入 |
| 06-session-a.sql／06-session-b.sql | **两个不同 PID，会话交替逐阶段执行** | 未提交不可见、提交后可见、更新回滚；最后删除专用实验行 |
| 07-query-builder.mjs | 独立 Node 运行或断点 | 输出 SQL 与 values，不连接数据库、不表示已经执行 |
| 08-join-multiplicity.sql | 支线只读查询，可反复执行 | 两个一对多得到七行；错误计数 6／6；预聚合得到 2／3、0／1；NULL 反例 |
| 09-session-state.sql | 第三个空闲观察编辑器，Auto-commit、不包 BEGIN | 按已取得的 A／B PID 找到会话，比较 idle 与 idle in transaction；只查看当前库、当前角色 |

`02`、`03`、`05` 的实验都在一个事务中回滚，操作期间不切到另一个编辑器查看它们的未提交数据。固定实验 ID 如果已存在，先回滚并检查，不用覆盖写入或清空数据库处理冲突。03 的数量依据第十六章的一位用户与两条 seed；已有额外数据时先识别来源，不为对齐预期删除真实内容。

04 的准备语句只属于当前会话。若上次中断后提示重名，先 `SELECT name FROM pg_prepared_statements;`，确认存在 epp17_list 才 `DEALLOCATE epp17_list;`，随后重建。若重连则准备语句已消失。不要把程序输入拼成 EXECUTE 字符串；正式应用通过驱动参数接口传值。

运行独立组装示例：

```bash
node database/chapter-17/07-query-builder.mjs
```

支持 oldest/newest 两个固定排序选项；必需 userId，text 可选且非空白、最多 200 UTF-16 单元，拒绝 NUL／孤立代理项；limit 可选为 1～100，offset 为 0～10000。输入文本仅进入 values，结构来自常量白名单。这个隔离示例不增加 HTTP 参数，不收紧现有 API；第十九章再落实接入兼容。

## 双会话阶段与恢复

默认沿第十五章向导建立 `EPP · DEV-A`、`EPP · DEV-B` 两份相同开发参数的连接配置，各自打开一个编辑器；也可为 SQL Editor 的独立连接选择 Always，再新开 A、B，两种方式选一种。各自运行 current_database/current_user/pg_backend_pid：库和角色相同，PID 不同。保持会话固定，Data 页可能使用另一个连接，不能替代已核对的编辑器。

1. A0 检查实验 ID `40000000-0000-4000-8000-000000000006` 不存在。B0 开始 READ COMMITTED 事务。
2. A1 插入但不提交；B1 查询零行。
3. A2 COMMIT；B2 在原读事务中重新 SELECT，看到 Visible after commit.。
4. A3 在新事务中更新但不提交；B3 重查仍是 Visible after commit.。
5. A4 ROLLBACK；B4 重查不变，B 随后 COMMIT。
6. A5 按固定 ID、拥有者和原文删除专用实验行并提交；B5 重查零行。
7. 两边结束事务，运行第十六章的核对文件，保留原用户和两条原始记录。

需要确认事务状态时，在原 DEV 的第三个空闲编辑器执行 09-session-state.sql；它自身不包 BEGIN，每个阶段重新查询。按 A／B 的实际 PID 匹配，不按结果顺序或相同的 application_name 猜测。A1／B1 都应为 idle in transaction；A2／B2 后 A 为 idle、B 仍在事务中；A4 与 B4 提交后两边均为 idle。出现 idle in transaction (aborted) 时回到那条连接 ROLLBACK，其他编辑器不能替它回滚。视图说明会话状态，行可见性仍由 B 的 SELECT 核对。

06 文件禁止作为初始化或自动批处理运行；每次选中一条完整 SQL 执行，完成当前阶段的全部语句后再切换会话。B1～B4 重复执行的是同一条 SELECT，每次重新发到服务器；查看旧结果网格不算重查。B 的读事务不应留到下次学习。

提交附近断线，先重连查实验 ID，不断言成功或失败。未提交修改可在原会话 ROLLBACK；A2 已提交的数据不会被后来回滚撤销。如果发现专用行内容与本章固定拥有者／Visible after commit. 相符，可执行 A5 清理；不存在则无需处理；内容不符先查明来源，不扩大删除条件。清理返回零行时同样先查询，不删除其他数据。

## 后续接入责任

本篇 SQL 默认按 created_at ASC、id ASC 排序，它不等同 Map 的插入顺序。第十九章接入时需同步 OpenAPI 与调用方约定，保留字面、大小写敏感的搜索语义，明确原文和搜索词的数据库可表示性边界，并核对时间和 bigint 等返回类型。

本章无持久结构变化，下一章仍从第十六章两张表及原始数据建立 Prisma 基线。不能因为切换 Git 分支就认为数据库已经回到相应状态；通过核对查询确认现状，再应用后续迁移。
