# 第 47 章浏览器实验

从第 46 章独立 VERIFY 或其恢复副本继续。代码分支为 `part-06/chapter-47`。保留本地 Postman 环境及已有收件箱数据。首次从空库开始时，用[第 46 章说明](../../database/chapter-46/README.md)准备隔离库、Mailpit、练习账号及角色。已经迁移到第 46 章的库不需要执行数据库变更。下文假定从建库记录独立取得的库名为 epp_ch47_verify。

1. 项目根目录用 Node 24.22.1，执行 `npm ci`、`npm run check`。将 `.env.test` 中的 TEST_DATABASE_URL 指向本章联调库，`.env.worker` 中的 DATABASE_URL 指向同库；自动回归另用独立测试库。仅对这份 VERIFY 练习。
2. 在 API 终端按下面的命令启动 3360。APP_ORIGIN 对应浏览器的 3100 端口，登录等写操作会验证页面来源。保留 Inspector 9229 供 VS Code 附加。
3. 在另一终端运行 `API_PORT=3360 node examples/inbox-stream/server.mjs`，访问 http://127.0.0.1:3100/ 。固定使用同一主机名。代理只在回环地址提供实验页面，转发登录、身份、首页和事件流四种请求，透传 Cookie 和响应字节。正式 API 与生产构建均不提供这个页面。
4. 导入[本章集合](../../requests/chapter-47.postman_collection.json)，baseUrl 指向 API 的 http://127.0.0.1:3360。用[第 46 章的步骤](../../database/chapter-46/README.md)注册并开通虚构账号。让站内角色先投递 registered；13、15、16 标已读，18 回查。停站内角色，保留或重新启动寄信角色；06、07 完成重置，08 确认撤销，10 用新密码登录。此时 password-reset 待投递。页面也用新密码及同一邮箱登录，初次查询只看到先前的注册通知。
5. 页面点“断开连接”。停止开发邮件 watcher 后用另一终端下方的 notifications 命令处理待办。在 Postman 单发 18 看到两条，页面仍保留原结果。点“重新连接”再看首页。让页面保持在线，在 Postman 用 13 选中首行、15 取当前会话的令牌、16 标记，页面再次回查。19 可在 Postman 单独打开观察命名事件，结束后取消。多次实验使用本轮身份和事件 ID 核对。
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
