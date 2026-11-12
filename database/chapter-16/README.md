# 第十八章：关系建模与首批业务数据

前置环境为第十七章的 PostgreSQL 18：`127.0.0.1:55432`、数据库 `epp_dev`、角色 `epp_owner`。本章代码分支 `part-03/chapter-18` 从第十七章继续。密码仍通过客户端交互输入，不写入 SQL 或连接命令。

新增 public.users 与 public.captures。用户 ID、记录 ID 使用 uuid；记录明确写入 user_id；原文使用 text，保留空格；创建时间使用 timestamptz(3)。数据库保证主键、非空、非空串与引用完整性，完整的 2000 个 UTF-16 单元及非全空白输入规则仍在业务边界；表结构本身不是完整的 API 输入校验，也不构成用户访问控制。

## 首次建立，按步骤核对

日常数据库操作默认使用 DBeaver Community。先按第十七章启动实例，在 DBeaver 连接 `EPP · DEV · 55432 · epp_dev`，选中数据源，通过 SQL Editor 新建编辑器。打开 `database/chapter-15/03-inspect.sql`，运行只读诊断；展开 Schemas → public → Tables 核对现状。

首次建表要求该开发库尚无这两张业务表。已有对象时先核对结构和数据，不删除对象重跑。打开文件只是打开 SQL 文本，不是导入到数据库；新旧编辑器都要各自核对数据源。

本章文件自带 BEGIN/COMMIT/ROLLBACK。空闲会话中确认 Auto-commit、关闭 Smart commit；偏好设置 Editors → SQL Editor → SQL Processing → Scripts 中选择 Commit type = No commit、Error handling = Stop + rollback，并启用 Fetch query results。脚本中的显式 COMMIT 仍会执行；不由执行器额外逐句提交，也不在事务中启用每次执行前重新连接。

按顺序操作，前一步成功后再继续：

1. 打开 `01-create-tables.sql`，取消选区，用 **Execute SQL Script** 顺序执行，确认末尾 COMMIT 成功。
2. 刷新 Tables，双击 users/captures，在 **Properties** 中核对 Columns、Constraints、Foreign Keys、Indexes；切换 **Diagram** 查看关联，再结合非空与唯一性判断关系的数量边界。保持只读模式，不把图形布局或虚拟关系当作服务器约束。
3. 打开 `02-seed-development.sql`，同样执行完整脚本并确认提交。
4. 打开 `03-inspect-model.sql` 执行只读核对，查看各结果页；也可打开表的 **Data** 页并 Refresh。

Execute SQL Statement 用于当前或选中语句；Execute SQL Script 运行整份或选中部分。这里不用 Script natively，也不并行执行有前后依赖的语句。出现错误就停止；需要清理时在原编辑器、原连接单独执行 `ROLLBACK;`。若执行器已自动回滚，重复回滚可能提示当前不在事务中。连接中断、提交结果不确定时，重新连接并查询实际对象和固定 ID，不盲目重放。

seed 创建一个用户和两条记录。用户 ID 为 `10000000-0000-4000-8000-000000000001`；记录 ID 为 `20000000-0000-4000-8000-000000000001`、`20000000-0000-4000-8000-000000000002`。两条记录共享用户，创建时间均为 `2026-10-31T08:00:00.123Z`。第一条原文两端各有两个空格，第二条原文包含一个撇号。此后保留这些数据，供第十九章起继续使用。

重复初始化会拒绝已存在的对象或主键，不通过 IF NOT EXISTS、冲突忽略或覆盖更新掩盖结构与数据差异。重跑 seed 遇错时回滚的是这次事务，不会撤销以前已提交的数据。只有确定此前未提交、当前无对应数据时才重新执行完整 seed；手工部分提交过则先查明实际缺失内容。

## 日常阅读与故障对照

| 文件 | 使用方式 | 预期结果 |
| --- | --- | --- |
| 01-create-tables.sql | 确认空白起点后只执行一次 | 两张表、主外键、非空／CHECK、user_id 普通索引 |
| 02-seed-development.sql | 开发库首次显式执行 | 一个用户与两条合法演示记录，一起提交 |
| 03-inspect-model.sql | psql 或 DBeaver，可反复读取 | 连接、列、约束、索引与已有数据 |
| 04-rejected-writes.sql | 手动逐组运行，**不是初始化脚本** | 外键、非空、主键、CHECK、删除引用五类拒绝 |
| 05-time-representation.sql | 空闲会话逐条运行，比较两个 SELECT 后回滚 | server_text 显示服务器时区，epoch_seconds 证明时间点不变；结束后还原设置 |
| 06-text-boundaries.sql | 支线只读查询 | 字符／字节、NULL、空白及显式截断的区别 |
| 07-text-boundaries.mjs | `node database/chapter-16/07-text-boundaries.mjs` | JS 字符与编码边界对照，不需数据库连接 |

03 同时检查约束的 convalidated／conenforced：本章创建的约束均应为 true。定义存在不等于已有数据已验证、后续写入会被执行检查；图中的关系线不能代替这个核对。

04 每组的操作顺序：执行 BEGIN 和一条预期失败语句；读取 SQLSTATE／约束名；**另外执行 ROLLBACK**；重新读取原有数据。不要用 ON_ERROR_STOP 的批处理整份运行，因为第一个预期错误就会停下。即使实验意外成功也回滚，先查目标、结构与前提。psql 使用 `\errverbose` 查看上次错误，DBeaver 使用错误详情；不公开含真实数据的完整错误。

05 的两个 SELECT 分别在 UTC 与 Asia/Shanghai 下执行。server_text 为 `2026-10-31 08:00:00.123+00` 和 `2026-10-31 16:00:00.123+08`，epoch_seconds 都为 `1793433600.123`。created_at 单元格可能被客户端再次格式化；文本列和数值列用于分清服务器输出、客户端展示与实际时间点。不要用 UPDATE 修正显示时差。

DBeaver 的 SQL 文件保存只保存文字；Data 页 Save 发送网格修改，Cancel 放弃未保存修改；Manual commit 模式下还要 Commit 或 Rollback 结束事务。已自动提交的更改不能用 Cancel 撤销。本章可以修改单元格后不保存、直接 Cancel 观察界面状态，保留后续章节需要的原始 seed 数据。

日常不再运行 01、02。实例可用后，在 DBeaver 重新连接并执行 `03-inspect-model.sql` 即可。客户端 Disconnect 不等于停止数据库；按正文用 pg_ctl 受控重启独立实例后，回到 DBeaver 重新查询。Git 切换章节不回滚数据库，不能在已演进的库上重放旧建表文件。

需要终端复现时才使用以下只读备用入口；日常图形操作不要求执行它：

```bash
psql -X -W -v ON_ERROR_STOP=1 \
  'host=127.0.0.1 port=55432 dbname=epp_dev user=epp_owner connect_timeout=5' \
  -f database/chapter-16/03-inspect-model.sql
```

## 与应用和后续章节的边界

本章不修改 Nest、CaptureStore、依赖和开发／生产启动入口。`npm run dev` 仍使用 Map，数据库里的两条记录不会出现在现有 HTTP 接口中。`npm run check` 与 `npm start` 沿用既有行为，database 目录不进入应用生产产物，开发 seed 不在生产运行。

下一章展开 SQL 与列表排序，第二十章将这些既有结构纳入迁移基线，第二十二章才接入 Nest。接入时需要显式映射字段与时间，处理 NUL／孤立代理项不可原样写入 text 的边界，并确认排序契约；稳定的 created_at/id 排序不等于 Map 的精确插入顺序。正文与支线包含上述选择的推导，文件不作为通用导入器或自动迁移器。
