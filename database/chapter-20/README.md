# 第二十章：给已有记录增加中文意图

从 `part-03/chapter-19` 继续，完成分支为 `part-03/chapter-20`。固定 Node 24.22.1、Prisma/adapter-pg 7.10.1 和 PostgreSQL 18，沿用第十九章运行依赖；不升级或重建数据库。正式迁移只有在 `0_init` 之后追加的 `20261102040511_add_chinese_intent`，不改基线。

## 使用完成代码

1. 停止开发服务。在 DBeaver DEV 连接核对 `epp_dev`、实例和角色；先用第十八章 `02-inspect-data.sql` 导出旧行完整值，保留原有用户及所有合法记录。
2. `.env.database` 指向日常库，`.env.database-verify` 指向第十八章校验库，运行 `.env` 指向日常库；三份配置用途不同。终端先 `unset DATABASE_URL SHADOW_DATABASE_URL`，避免外部变量覆盖文件。
3. 本章完成代码已经带迁移，直接按以下命令应用。不要再生成重复的同名迁移，也不要确认 reset。

```bash
nvm use
npm ci
npm run db -- migrate status
npm run db -- migrate deploy
npm run prisma:generate
npm run check
npm run dev
```

应用之前，status 提示本章迁移待执行是预期结果；若同时有缺失历史、失败记录或未知变化，先调查。迁移依赖既有开发库；运行时不会自动迁移，也不会 seed 用户。默认开发 Inspector 和自动编译重启继续使用。生成新客户端前先停旧 dev，避免运行代码与生成文件处于不同阶段。

DBeaver 刷新 `captures` 元数据后执行 `02-inspect-change.sql`：新增 `chinese_intent text NULL`、无默认值、CHECK 已验证；旧 ID、原文、归属、创建时间逐字段保持，意图为 NULL。Prisma diff 不替代 CHECK 目录检查。

## 沿前章生成迁移

从第十九章动手时，先在 ADMIN 的 postgres 连接开启自动提交，逐条执行 `01-create-shadow.sql`。名字已存在先确认用途，不删除。把本目录 `database.env.example` 合并至根目录 `.env.database` 并填 URL 编码后的密码，日常库与影子库必须分开；`epp_migration_check` 不是影子库。

在 Schema 的 Capture 中新增 `chineseIntent String? @map("chinese_intent") @db.Text`，然后：

```bash
npm run db -- migrate dev --name add_chinese_intent --create-only
```

先打开生成的 SQL 审查；正文给出的事务、有限超时和 CHECK 都应在首次成功应用之前加入。完成代码提供最终 SQL。自行生成的时间前缀会不同，不重命名已执行文件。审查完成后 `npm run db -- migrate dev`，再显式生成客户端与 check。Prisma v7 不自动 generate/seed。出现漂移或重置提示就停止核对。

向校验库运行 `npm run db:verify -- migrate deploy`、`migrate status`，并执行 `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`；应无支持范围内差异。校验库原本为空就继续为空，迁移不包含业务样本。

## 图形请求与断点

导入 `requests/chapter-20.postman_collection.json`。集合变量 `baseUrl` 默认为 `http://127.0.0.1:3000`，`captureId` 初值为第一条标准旧记录；先 GET 核对再修改，自己创建的记录则复制响应 ID。创建请求每次都会新增，不自动运行整组。

- GET 旧记录：新字段为 null，其他字段保持。
- POST 旧格式：只给 originalText 仍为201，意图为 null；带意图时原样保存。
- PATCH `/captures/:id`：必须有 chineseIntent，字符串替换、null清空，缺失或空白400；ID不存在或不属当前固定用户404。
- PATCH 仅修改意图；额外 originalText/id/createdAt/userId 被忽略。后写覆盖同字段，不支持修订历史、If-Match或自动合并。
- GET 的 q 仍只搜索英语原文。修改后旧 GET ETag 不应错误地产生304。

Swagger 的 `/docs` 也可 Try it out，OpenAPI 版本0.4.0。VS Code 在 CapturesService.updateIntent、PrismaCaptureStore.updateIntent 或输出拦截器设断点；如果在方法断点前就405/415，先检查 HTTP 边界和正文解析。只在示例数据上观察SQL参数，常态日志不打印原文或意图。

数据库侧重新运行 `02-inspect-change.sql`，核对同一ID的值。支持输入非空白且最多1000 UTF-16单元、无NUL/孤立代理项。DB CHECK 的字符计数和 btrim 空白范围更窄，不宣称完全复制API规则。

## 必填与分批回填实验

`03-required-intent-lab.sql` 在同一 DBeaver DEV 编辑器创建临时表，按编号分段执行：直接 SET NOT NULL失败23502；回滚；新增NOT VALID防线；插入NULL失败23514；回滚；填入经确认实验值；VALIDATE；SET NOT NULL；删除辅助CHECK；再次拒绝NULL；清理临时表。预期错误后在同一会话ROLLBACK。业务captures继续可空，正式历史不增加未来必填迁移。

`07-batch-backfill-lab.sql` 同样只用临时表。先建表和示例来源，然后把BEGIN到COMMIT整块重复三次：修改1/2，再修改4，最后零行。第3条用户新值保持，第5条没有来源仍缺失。先查询结果和剩余原因，再执行文件末尾DROP。不将零行更新当成全量完成。

## 隔离的迁移失败恢复

使用专用 `epp_ch20_recovery`，绝不能将以下环境文件指向日常库。ADMIN的postgres连接自动提交，执行 `06-create-recovery-database.sql`；复制 `recovery.env.example` 为根目录 `.env.database-recovery`，填写同一实例上的角色凭据。建立两条指向该库的DBeaver独立会话A/B，用pg_backend_pid确认不同。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL
node database/chapter-20/prepare-recovery.mjs baseline
node --env-file=.env.database-recovery node_modules/prisma/build/index.js \
  migrate deploy --config database/chapter-20/recovery.prisma.config.ts
node database/chapter-20/prepare-recovery.mjs append
```

脚本把正式迁移逐字复制到被Git忽略的 `recovery-history`。baseline只复制0_init；append再加入新增历史。它不连接数据库，也不删除既有目录；重复准备报已存在时先检查当前状态，不重置。

A执行 `05-recovery-lab.sql` 中身份、BEGIN、SET LOCAL和SELECT，停在ROLLBACK之前。B运行 `04-observe-migration-lock.sql`。终端执行：

```bash
node --env-file=.env.database-recovery node_modules/prisma/build/index.js \
  migrate deploy --config database/chapter-20/recovery.prisma.config.ts
```

应因迁移等锁超过2秒而失败；若A闲置超过60秒，其实验事务会被关闭，需要重新连接并重新开始才能观察这次故障。CLI可能仅显示事务已失败；用迁移尝试的时间/PID在PostgreSQL日志查找首个lock timeout。迁移logs可能为空。A在同一编辑器ROLLBACK释放锁；B确认新列不存在、失败记录未完成。未处理失败记录前，再次deploy会被P3009阻止。

确认SQL回滚、无残留后：

```bash
node --env-file=.env.database-recovery node_modules/prisma/build/index.js \
  migrate resolve --rolled-back 20261102040511_add_chinese_intent \
  --config database/chapter-20/recovery.prisma.config.ts
node --env-file=.env.database-recovery node_modules/prisma/build/index.js \
  migrate deploy --config database/chapter-20/recovery.prisma.config.ts
```

实际迁移名若不同，使用隔离目录中的名称。成功后应有已标回滚的失败尝试及新的成功尝试，新列和CHECK存在。resolve不执行回滚或补写，不能用它代替调查。本实验结束后断开A/B，保留隔离库便于回查，不影响日常服务。

## 交付与恢复

`npm run check` 和已有 `npm test` 沿用；test需要已迁移的独立校验库。生产构建 `npm run build` 后，由目标环境提供运行配置再 `npm start`，不开放Inspector，默认不开放docs；迁移应由有固定Prisma CLI和迁移文件的独立步骤先执行。`--omit=dev`的应用目录通常没有CLI，不能把迁移塞进每次应用启动。测试连接在根目录 `.env.test` 用 `TEST_DATABASE_URL` 单独提供；缺失时在打开应用前退出，不回退到开发 `.env` 或继承的 `DATABASE_URL`。配置与运行方式见[项目测试说明](../../README.md)。

本次可空扩展兼容第十九章旧程序读写；新程序连旧结构应在启动探测失败。回退旧程序保留新列和值，意图功能暂不可用；不执行DROP来“配合代码回退”。生产并行发布及备份恢复的完整安排在部署篇展开。
