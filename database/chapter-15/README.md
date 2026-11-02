# 第十五章：数据库运行环境

本章建立 PostgreSQL 18 的独立开发实例，使用回环地址 `127.0.0.1`、端口 `55432`、实践库 `epp_dev` 和开发所有者 `epp_owner`。`epp_admin` 只用于实例管理；两个角色的密码由操作者在提示中设置，不写入文件。

安装、初始化、启停、DBeaver 连接及故障推导见第十五章正文。数据库文件保存在读者自己的项目目录之外；重开终端后按正文重新设置 `EPP_PGDATA` 和 PostgreSQL 18 的 PATH。不能把代码分支切换当成数据库回滚。

前三个文件按正文顺序使用，第四个用于认证支线，不能一口气当成迁移执行：

| 文件 | 执行位置与身份 | 作用 |
| --- | --- | --- |
| [01-create-role.psql](01-create-role.psql) | 管理员连接 `postgres`，psql | 创建开发所有者，然后交互设置密码 |
| [02-create-database.sql](02-create-database.sql) | 管理员连接 `postgres`，psql 自动提交 | 创建实践库并收回 PUBLIC 的数据库权限 |
| [03-inspect.sql](03-inspect.sql) | 所有者连接 `epp_dev`，psql 或 DBeaver | 只读核对连接身份、端口、版本、编码、时区、Schema 与环境备注 |
| [04-auth-rules.sql](04-auth-rules.sql) | 管理员连接 `postgres`，psql 或 DBeaver | 支线 15A 检查 HBA 当前文件和解析结果，不代表已加载状态 |

在代码仓库根目录启动管理员会话：

```bash
psql -X -W -v ON_ERROR_STOP=1 \
  'host=127.0.0.1 port=55432 dbname=postgres user=epp_admin connect_timeout=5'
```

先执行正文的管理员身份及数据目录核对，再在 **psql 内**执行：

```psql
\i database/chapter-15/01-create-role.psql
\i database/chapter-15/02-create-database.sql
\q
```

文件 01 含 psql 元命令，不能交给 DBeaver 的普通 SQL 编辑器。创建角色和数据库不是重复执行的启动步骤。若中途失败，先检查已有角色和库，按正文从失败处恢复；不删除已有对象来重跑。`ON_ERROR_STOP` 会停止当前脚本，不能回滚此前已经提交的语句。文件 02 不得用 `--single-transaction` 或放在 `BEGIN` 中执行。

改用开发所有者，单独验证密码和权限，再执行只读检查：

```bash
psql -X -W -v ON_ERROR_STOP=1 \
  'host=127.0.0.1 port=55432 dbname=epp_dev user=epp_owner connect_timeout=5' \
  -f database/chapter-15/03-inspect.sql
```

预期 database_name 为 `epp_dev`，两个角色字段为 `epp_owner`，地址/端口为 `127.0.0.1`/`55432`，版本为 `18.x`，编码为 `UTF8`。不同客户端的 connection_pid 通常不同。尚未写入备注时 environment_note 为 NULL；按正文添加备注并重启数据库后仍应可见。

## 日常返回，不重复初始化

首次配置 DBeaver 时保存 DEV（epp_dev／epp_owner）与 ADMIN（postgres／epp_admin）两条连接，均使用 127.0.0.1:55432。显示名称分别为 `EPP · DEV · 55432 · epp_dev`、`EPP · ADMIN · 55432 · postgres`。日常业务 SQL 用 DEV；04 的认证检查与后续建校验库用 ADMIN。每次从查询确认实际身份，不能只信连接标签。

日常先在 DBeaver 连接 DEV，执行 03-inspect.sql。成功且目标符合预期就继续，不必重复终端核对。备注写入也在 DEV 的 Auto-commit 模式、关闭 Smart commit、没有显式事务时执行，再重新查询观察。连接被拒绝，需要检查实例时，才在新终端恢复程序路径：macOS 执行 `export PATH="$(brew --prefix postgresql@18)/bin:$PATH"`，Ubuntu／WSL 执行 `export PATH="/usr/lib/postgresql/18/bin:$PATH"`。然后检查原实例：

```bash
export EPP_PGDATA="$HOME/.local/share/epp-book/postgresql-18"
pg_ctl -D "$EPP_PGDATA" status
```

用的是初始化时的目录；若当时更改过路径，这里同步修改。已经运行就直接连接。明确报告未运行时，执行 `pg_ctl -D "$EPP_PGDATA" -l "$EPP_PGDATA/server.log" -w start`；目录不存在或不可访问则先修正路径和权限，不自动重建。

启动后回到 DBeaver 重新连接并执行 03-inspect.sql；上面的 psql `-f` 是等效备用入口。尚未配置时回到正文 15.3 建立连接。不要重跑文件 01、02；后续章节已经建表时，也不再要求 public 为空。中断在首次创建过程中的情况，仍按前面的失败恢复说明处理。

本章不创建用户表或记录表，不新增 Prisma 和数据库驱动，不把连接串加入尚未消费它的 Nest 配置。主服务依旧使用 Map；`npm run dev` 保持断点与自动重启，`npm run check`、`npm start` 保持既有构建和生产运行行为。业务表、SQL、迁移与接口替换依次在第十六至十九章建立。

这些 SQL 文件是环境准备与连接诊断材料，不是部署时自动执行的初始化器，不包含密码、数据目录或生产环境配置。运行产物只需已有 `dist` 和运行依赖，本目录不进入应用生产构建。
