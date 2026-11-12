# 第 51 章　持续处理验证邮件的独立 Worker

从 `part-06/chapter-49` 继续，完成快照为 `part-06/chapter-51`。HTTP 契约沿用前章，追加一行持久化的验证邮件通道控制数据。升级前停止旧版发送者；旧任务状态、载荷与业务意图保留。只在独立的第 49 章 VERIFY 或其恢复副本操作；从空库起步见[第 49 章](../chapter-42/README.md)。在 DBeaver 打开[观察 SQL](01-observe.sql)，升级前只执行旧表查询；末尾的通道查询在迁移后执行。先确认当前库与状态计数，再按 available_at、id 查看全部到期待办的身份和收件人。按地址查询中的 current_intent_state 对应意图的当前状态，missing 表示意图行已清理；不能用当前状态倒推某一封旧信是否被消费。Worker 会处理目标库中所有到期 pending，先确认都是可寄送的本地练习信。使用原快照的数据无需重发或回填。

**安装与核对。** 项目根目录用 Node 24.22.1。把迁移文件 `.env.database-verify` 的 DATABASE_URL 和 `.env.test` 的 TEST_DATABASE_URL 指向本轮 VERIFY。以下预期库名取自建库记录，若不同须逐处替换。把[Worker 配置样例](worker.env.example)复制为项目根目录 `.env.worker`，填入同库连接和本轮 Mailpit SMTP 端口。密码使用 URL 编码，文件仅留本地。沿用第 43 章 Mailpit 的回环 SMTP 1025、网页 8025，保持 Mailpit 运行。

```bash
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG
node --env-file=.env.database-verify --input-type=module -e '
const { withVerifiedDatabase } = await import("./scripts/verify-database.mjs");
await withVerifiedDatabase(process.argv[1]);' epp_ch43_verify
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch43_verify
npm run db:verify -- migrate status
npm run check
```

上面 deploy 适用于非空第 49 章副本；独立空库用 bootstrap。首次升级核对旧消息原值、控制表 id=1 且 paused_by 为空，再启动新程序。

**API 终端。** 在同一个项目根目录运行。启动后导入[第 51 章集合](../../requests/chapter-43.postman_collection.json)，baseUrl 默认为 3360。只在未同步的本地环境设置练习密码和令牌。首次从 01 开始前，确认尚未启动 Worker。

```bash
unset DATABASE_URL TEST_DATABASE_URL APP_ORIGIN PORT DB_QUERY_DEBUG
NODE_ENV=development node --env-file=.env.test --input-type=module -e '
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { withVerifiedDatabase } = await import("./scripts/verify-database.mjs");
await withVerifiedDatabase(process.argv[1]);
process.env.PORT = "3360";
process.env.APP_ORIGIN = "http://127.0.0.1:3360";
process.env.DB_QUERY_DEBUG = "false";
await import("./scripts/dev.mjs");' epp_ch43_verify
```

**Worker 终端。** 先发 01，核对该消息 pending，再在第二个终端从项目根目录启动：

```bash
unset DATABASE_URL DB_POOL_MAX DB_QUERY_DEBUG LOCAL_SMTP_PORT LOG_LEVEL
npm run dev:worker -- epp_ch43_verify
```

看到 worker.ready 后观察同一消息 accepted 及 Mailpit 注册邮件。两进程的调试端口分别为 9229 和 9230，在 VS Code 选择对应的 Attach。只有一个 Worker 终端；日常使用持续处理时无需再运行 send-one。修改 .env.worker 后退出并重开该终端命令。

**两轮观察。** 用注册邮件完成 02，按[第 43 章的开通 SQL](../chapter-36/02-grant-fixture.sql)替换邮箱和本次 userId，在 VERIFY 开通后发 05 登录。12 应为 200。关闭 Worker、保留 API 与 Cookie，再发 06 请求重置，预期 202／pending／12 仍为 200。重启 Worker，重置邮件到达后，12 仍为 200。用本轮 resetToken 发 07，得到 204 后发 08，旧 Cookie 现在为 401；10 用新密码登录，12 回到同一用户。按步骤单发，遇 429 按 Retry-After 等待。旧编号 08 只用于验证撤销后拒绝。

**故障与交付。** 空闲时 Ctrl-C 会唤醒等待；有在途投递时先等待写回再关闭连接池。发送前在库中占用通道；SMTP 异常留下 unknown 与占用，子进程退出 2。重新启动或运行第 51 章 send-one 都会报告 paused，后继邮件仍待发。停止该通道所有发送者（包括开发 watcher），恢复 SMTP 并核对旧消息后，按[按故障 ID 放行](02-resume.sql)先查库和消息，再替换两个占位值并执行 UPDATE。确认返回一行并已提交后重启；返回零行先重查。原消息不会被重寄；遗留 attempting 必须先确认原进程已终止。数据库错误退出 1。收到停止信号后，若事件循环可运行，十秒排空定时器到期也退出 1。先按消息 ID 查现场，再处理后来排队的工作；attempting、unknown 均不自动重发。

在拥有前章测试样本的隔离库运行 `npm test`。生产干净目录复制 dist、package.json、package-lock.json、.npmrc，执行 `npm ci --omit=dev`。API 沿用 `npm start` 与原有生产变量；Worker 仅注入本角色使用的数据库、日志与 SMTP 配置，前台用 `npm run start:worker -- 预期库名`，托管时直接执行 `NODE_ENV=production node --enable-source-maps dist/src/mail-worker.js 预期库名`。生产命令不加载开发 env 文件或 Inspector。练习结束关闭本轮两个进程与 Mailpit，清除 Postman 本地秘密。
