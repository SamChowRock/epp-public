# 第 47 章浏览器实验

从第 46 章独立 VERIFY 或其恢复副本继续。代码分支为 `part-06/chapter-47`。保留本地 Postman 环境及已有收件箱数据。首次从空库开始时，用[第 46 章说明](../../database/chapter-46/README.md)准备隔离库、Mailpit、练习账号及角色。已经迁移到第 46 章的库不需要执行数据库变更。下文假定从建库记录独立取得的库名为 epp_ch47_verify。

1. 项目根目录用 Node 24.22.1，执行 `npm ci`、`npm run check`。将 `.env.test` 中的 TEST_DATABASE_URL 指向本章联调库，`.env.worker` 中的 DATABASE_URL 指向同库；自动回归另用独立测试库。仅对这份 VERIFY 练习。
2. 在 API 终端按下面的命令启动 3360。APP_ORIGIN 对应浏览器的 3100 端口，登录等写操作会验证页面来源。保留 Inspector 9229 供 VS Code 附加。
3. 在另一终端运行 `API_PORT=3360 node examples/inbox-stream/server.mjs --fault-console`，访问 http://127.0.0.1:3100/ 。固定使用同一主机名。代理只在回环地址提供实验页面，转发登录、身份、首页和事件流四种请求，透传 Cookie 和响应字节。正式 API 与生产构建均不提供这个页面。
4. 导入[本章集合](../../requests/chapter-47.postman_collection.json)，baseUrl 指向 API 的 http://127.0.0.1:3360。沿用第 46 章已开通的练习账号和当前密码，Postman 登录后用 18 记下原首页、ID 与已读时间。从空库开始时才用[第 46 章的步骤](../../database/chapter-46/README.md)注册、开通，先投递 registered。停通知 Worker，保留寄信能力。若没有上次留下的有效 password-reset 待办，用 06 申请重置、在 07 提交本轮信里的令牌和新的练习密码、08 确认原会话撤销、10 新密码登录。按 userId 记录新待办 ID、期限；18 此时仍是基线。页面用该账号及重置后的密码登录。
5. 页面点“断开连接”。停止开发邮件 watcher 后用另一终端下方的 notifications 命令处理待办。Postman 单发 18 已有新的 ID，页面仍保留原结果。点“重新连接”后新通知应出现在首页。保持一个实验页在线，等初始查询结束。向 3100 入口的终端输入 `503` 并回车，看到“503 已就绪”；只会让经该入口的下一次首页 GET 返回 503。此时不要手动刷新。在直连 3360 的 Postman 用 13 选中最新未读首行、15 取当前会话的令牌、16 标记一次。页面应依次记录 inbox、503、一秒后 GET 200，显示已读；两次查询之间没有新的 open 或 inbox。用 18 核对，19 可另开观察事件流，用完手动取消。
6. 生产运行需复制 dist、package.json、package-lock.json、.npmrc 并 `npm ci --omit=dev`；分别注入原有 DATABASE_URL、API 的 APP_ORIGIN、CURSOR_HMAC_KEY、PORT 配置，使用 `npm start` 与 `npm run start:worker -- epp_ch47_verify notifications`。正式 HTTPS 入口保持同源，按路径检查缓冲与链路空闲超时。结束实验关闭流、实验页服务、API 和自己的 Worker。

```bash
unset DATABASE_URL TEST_DATABASE_URL APP_ORIGIN PORT DB_QUERY_DEBUG
NODE_ENV=development node --env-file=.env.test --input-type=module -e '
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { withVerifiedDatabase } = await import("./scripts/verify-database.mjs");
await withVerifiedDatabase(process.argv[1]);
process.env.PORT = "3360";
process.env.APP_ORIGIN = "http://127.0.0.1:3100";
process.env.DB_QUERY_DEBUG = "false";
await import("./scripts/dev.mjs");' epp_ch47_verify
```

```bash
unset DATABASE_URL DB_QUERY_DEBUG DB_POOL_MAX LOCAL_SMTP_PORT LOG_LEVEL
npm run dev:worker -- epp_ch47_verify notifications
```
