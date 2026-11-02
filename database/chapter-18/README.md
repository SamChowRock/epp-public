# 第十八章：Prisma 模型与迁移基线

从 `part-03/chapter-17` 继续。日常库是第十五章实例上的 `epp_dev`，角色 `epp_owner`，端口默认 `55432`；已有第十六章两张表、一个用户和两条记录，第十七章临时实验应已清理。服务仍使用 Map，第十九章才接入客户端。

本章固定 Prisma CLI／`@prisma/client` 7.10.1，使用 v7 配置与 `prisma-client` 生成器。默认用 DBeaver 观察数据库，VS Code 查看模型与 SQL。以下命令从项目根目录执行。

## 安装与生成

```bash
nvm use
npm ci
npm run prisma -- version
npm run prisma -- validate
npm run check
```

Node 为 24.22.1。安装保留锁文件；支持脚本批准机制的 npm 读取 package.json 的 `allowScripts`，允许固定版本 Prisma／引擎及 esbuild 的安装脚本。不因出现其他脚本提示就一律批准。沿前章逐步新增依赖的过程见正文。

`predev`、`pretypecheck`、`prebuild` 先生成 `src/generated/prisma/`；生成结果不提交，Schema 和锁文件提交。NodeNext 编译到 `dist/src/generated/prisma/`。无 URL 时也可校验、生成及构建，这些动作不连接数据库。运行中的 dev 不直接监视 Schema，修改模型后执行 `npm run prisma:generate`。

`npm run dev` 仍开启 Inspector 与编译重启；构建后 `npm start` 只运行产物，都不执行迁移。生成类型不会自动改变 HTTP 契约，也不代表已接入持久化。

## 连接与前置核对

1. 用 VS Code 将本目录 `database.env.example` 保存为根目录 `.env.database`，填写 URL 编码后的本地角色密码。文件已被 Git 忽略；不将 URL 放进截图、命令历史和日志。
2. 若终端曾导出其他 URL，先 `unset DATABASE_URL SHADOW_DATABASE_URL`。已有环境变量优先于 env 文件；`db` 加载日常配置，`db:verify` 加载校验配置，`prisma` 使用进程环境。
3. 在 DBeaver 打开 epp_dev 编辑器，结束前章事务，执行 `01-inspect-structure.sql`。确认实例、库、身份，再在 Properties 的列、约束／外键、索引页对照实际对象。
4. 执行 `02-inspect-data.sql`，把有序结果网格导出为本地 CSV，供登记后比较。标准前置样本是一位用户、两条原文，文本长度 28／21，记录时间均为 `2026-10-31 08:00:00.123+00`。用户创建时间保留当时实际值；自己合法增加的数据也要保留。

完成代码已提供整理后的模型，先查看文件，再反向读取而不覆盖：

```bash
npm run db -- db pull --print
npm run db -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

首次沿前章跟做用 `db pull` 写入初始模型，再按正文整理映射和命名；它不修改业务表。diff 的退出码 0 表示支持范围内无差异，2 有差异，1 错误，在 Bash／Zsh 紧接 `echo $?` 查看。

核对六列、UUID、非空、两个 timestamptz(3) 及默认时间，两个 ID 无默认值；外键两种动作均为 RESTRICT；索引包括两个主键索引及 captures_user_id_idx；表所有者为 epp_owner。Prisma 7 模型不能表示本章 CHECK，必须查看 pg_get_constraintdef、convalidated 与 conenforced，不能只依赖 diff。PostgreSQL 18 也显示 NOT NULL 约束，不固定结果行数。

## 检查基线草稿

正式文件是 `prisma/migrations/0_init/migration.sql`，配合 `migration_lock.toml`。它保留第十六章完整结构及 CHECK，不含 seed，不用 IF NOT EXISTS 隐藏业务对象冲突。观察生成器遗漏时使用独立草稿：

```bash
npm run db -- migrate diff --from-empty --to-schema prisma/schema.prisma \
  --script --output database/chapter-18/baseline-draft.sql
```

比较不连接数据库，但该版本迁移引擎仍要求数据源配置，所以使用 `db`。打开草稿确认有内容并对照 CHECK；草稿被 Git 忽略。不要覆盖已成功应用或已登记的正式迁移。

## 先重放独立空库

在 DBeaver 管理连接中确认同一实例的 postgres 库，自动提交开启，逐条执行 `03-create-verification-database.sql`。epp_owner 是 NOCREATEDB，建库由管理身份完成，迁移仍用 epp_owner。名字已存在时先检查用途，不删库。

复制日常连接，改数据库为 epp_migration_check、连接名为“EPP 迁移校验”，重新连接核对身份及空 public。把 `verify.env.example` 保存为根目录 `.env.database-verify`，填本地密码并确认数据库名，然后运行：

```bash
npm run db:verify -- migrate deploy
npm run db:verify -- migrate status
npm run db:verify -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

预期应用 0_init，历史同步，diff 为 0。刷新校验连接，应有 users、captures、_prisma_migrations，两张业务表为空。重新执行 `01-inspect-structure.sql`，与日常库比较列、业务约束及索引；迁移表和内部 OID 不用对齐。

在校验库打开 `05-check-constraint.sql`，核对数据库后逐条执行：事务中先插临时用户，再插空原文，应得到 SQLSTATE 23514／captures_original_text_nonempty。随后在同一编辑器执行 ROLLBACK，再查询两个计数，应都为 0。异常成功需调查 CHECK／连接／选区，不继续登记日常库。

## 再登记日常库

只有已有结构和空库重放都核对后执行：

```bash
npm run db -- migrate resolve --applied 0_init
npm run db -- migrate status
```

resolve 只登记，不执行建表。刷新 DBeaver 的 epp_dev，执行 `04-inspect-history.sql`；成功的 0_init 有 finished_at、无 rolled_back_at。两库对应的文件 checksum 应相同，但时间、内部 ID、applied_steps_count 不必相同。

再执行 `02-inspect-data.sql`，对照前后完整值：ID、原文及空格、归属、时间都应保持。行数相等不证明内容相等。保留两库；校验库不作为后续可清空的影子库。

## 中断恢复与后续

- 中断后先看目标身份、status、迁移记录和实际对象。已成功应用的基线再次 deploy 应无待执行操作；已登记的不再重复 resolve。
- 差异未解释清楚时不登记；resolve 不验证结构，status 不是完整漂移检测。
- 仅在专用校验库确认失败事务已回滚、无业务对象残留后，用 `npm run db:verify -- migrate resolve --rolled-back 0_init` 标记失败记录，再重试。该命令不撤销 SQL。任何目标已经成功应用的迁移不再编辑，修复应追加迁移。
- 日常库保留数据，不接受重置提示。第二十章另建 epp_shadow 并配置 SHADOW_DATABASE_URL，再生成和审查新增字段迁移；影子库不能指向日常库。
- 本章不执行 db push、不创建空业务迁移、不自动 seed。部署使用审查后的迁移文件执行 deploy，另外生成和构建客户端；迁移任务需要 CLI，只装生产依赖的服务目录不能替代迁移任务。

## 结构差异的设计实验

配合支线 18A 使用 [design-lab](design-lab/)：

- `rename-mapped.prisma` 保留 @map，仅改程序字段；`rename-physical.prisma` 去掉映射，观察生成的删加列 SQL。二者只用于 `migrate diff`，不替换正式模型、不生成客户端、不执行生成的 SQL。
- `01-rename.sql` 在 DBeaver 的同一校验库编辑器分组运行。第一组删加列触发 23502 后单独 ROLLBACK；第二组重命名保留 19 字符原文和 CHECK 引用，观察后同样 ROLLBACK。临时表名固定为 rename_example，不改成业务表。
- `02-index-drift.sql` 只在 epp_migration_check 创建实验索引；先确认该名字不存在。创建后 status 仍同步，对正式模型的 diff 为 2；对 `retain-index.prisma` 的 diff 为 0。最后只删除自己创建的实验索引，再对正式模型确认 diff 为 0。校验库和所有业务行保留。

```bash
npm run db -- migrate diff --from-schema prisma/schema.prisma --to-schema database/chapter-18/design-lab/rename-mapped.prisma --script --exit-code
npm run db -- migrate diff --from-schema prisma/schema.prisma --to-schema database/chapter-18/design-lab/rename-physical.prisma --script --exit-code
```

有实际索引时，下面两次比较分别应为 2 与 0：

```bash
npm run db:verify -- migrate status
npm run db:verify -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run db:verify -- migrate diff --from-config-datasource --to-schema database/chapter-18/design-lab/retain-index.prisma --exit-code
```

模型接受有效对象不等于迁移历史已补齐；基线生效前可修草稿并重新验证，生效后须追加迁移。主项目不因实验正式增加索引。

失败排查时，04-inspect-history.sql 也提供未完成记录和 logs 查询。logs 可能为空；CLI 若只显示事务失败，应按时间与后端 PID 查看第十五章 server.log 的首个 ERROR／STATEMENT，随后核对实际对象是否回滚。成功恢复后允许保留失败与成功两次历史记录，不手动删除失败行。

机制、取舍与完整操作顺序见第十八章正文及支线 18A。
