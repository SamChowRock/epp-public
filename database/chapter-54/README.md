# 第 64 章　构建与持续集成

起点是第 63 章，沿用原迁移、API、两个 Worker 角色和管理 CLI。构建使用 .nvmrc 中的 Node 24.22.1 和随附 npm。以下命令在项目根目录运行。第一次安装需要取得锁文件列出的包以及本机所需的原生组件。

```bash
nvm use
npm ci
npm run ci:check
```

格式范围见 [package.json](../../package.json) 的 format:check；Lint 覆盖 src、scripts、test，规则在 [biome.json](../../biome.json)。生成的 Prisma 客户端单独排除。开发 API、Worker 继续使用各自的 dev 命令。ci:check 会重新构建 dist，正在跑生产入口的目录应当独立。

打开[数据模型图](../../docs/generated/ERD.md)和[OpenAPI 快照](../../docs/generated/openapi.json)。在 VS Code 1.121 或以上可用 Markdown 预览看图。源头分别是 prisma/schema.prisma 和 src/openapi.ts 及其契约依赖。修改后运行 `npm run contracts:check`；有意改变时比较 dist 与 docs/generated 中的同名文件，执行 `npm run contracts:update`，审阅差异并将源文件、两份快照中实际有变化的文件随同一项修改交付。类型或构建失败先解决前面的错误。单独执行 build 会清理 dist；需要再次对照时重新执行 contracts:check。

## 练习交付

在本机 PostgreSQL 18 为本轮新建空库，例如 epp_ch54_delivery，让练习角色拥有该库和 public schema 的建表权限。在项目根建立未跟踪的 .env.delivery，仅填写 DATABASE_URL，使用目标实例的主机、端口、角色和新库名。独立记下预期库名。API 演练占用回环端口 3354；冲突时在命令前设置 EPP_CHECK_PORT 为另一个空闲端口。下方命令从文件向本次子进程提供配置，保留 [bootstrap 的空结构检查](../../scripts/deploy-verify.mjs)。

```bash
unset DATABASE_URL TEST_DATABASE_URL SHADOW_DATABASE_URL
node --env-file=.env.delivery --input-type=module -e '
  const { spawnSync } = await import("node:child_process");
  const run = spawnSync("sh", ["scripts/check-delivery.sh", process.argv[1]], {stdio:"inherit"});
  if (run.error) throw run.error;
  process.exitCode = run.status ?? 1;
' epp_ch54_delivery
```

[交付脚本](../../scripts/check-delivery.sh)在临时目录复制 dist、清单、锁文件和 .npmrc，执行 npm ci --omit=dev。本轮的[运行检查](../../scripts/check-runtime.mjs)只向各角色传入所需配置；本机邮件和头像服务在这个空队列实验中无需启动。API 应打印 app.ready 后正常退出，邮件与 notifications 角色分别出现 worker.ready，CLI 预览固定练习账号后数据库仍为 true。临时目录随脚本退出清理；数据库保留。已有业务库和已做过这轮练习的库都不能作为下一次 bootstrap 的目标。若安装、迁移或运行中途失败，先保留第一处报错；public 已有结构时，修复后另建空库再跑完整交付。

专用交付库已经有固定用户。要在本轮专用库接着跑已有回归，沿用第 58 章的 .env.test-regression，将 TEST_DATABASE_URL 填为此次交付库的连接，在源码根目录执行以下命令。保留旧资料的 VERIFY 用于联调与查收据。

```bash
unset DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG DOCS_ENABLED
NODE_ENV=test node --env-file=.env.test-regression --test --test-concurrency=1 test/*.test.mjs
```

实际交付保留第 63 章运行配置、业务数据库与原来的角色入口。CLI 对旧收据仍可按原库名、用户和操作 ID 执行 receipt。若需要接口联调，开发 API 和[第 60 章 Postman 集合](../../requests/chapter-51.postman_collection.json)沿用；[账号操作](../chapter-53/README.md)仍应在独立练习库进行。

[GitHub Actions 工作流](../../.github/workflows/build.yml)在 Ubuntu 托管 runner 上按相同顺序运行，PostgreSQL 服务跟随 job 建立与销毁。在自己的 GitHub 仓库启用 Actions 并提交到一个练习分支，打开该次提交的 Checks，展开第一个失败步骤；修正后应查看新提交对应的运行。单机跟做可以直接使用上面的命令。
