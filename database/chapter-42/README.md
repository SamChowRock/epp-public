# 第四十二章　把验证邮件交给一次性执行者

起点为密码路线 `part-05/chapter-36`，完成分支为 `part-06/chapter-42`。本章复用[第 36 章 Postman 集合](../../requests/chapter-36.postman_collection.json)。把 baseUrl 指向本轮 VERIFY 的 API，email 改为自己控制的虚构地址。接口名称、字段与集合编号沿用。01 注册和 06 重置都先入队，在 02 或 07 确认前需运行一次寄信程序。

1. 按[前章环境步骤](../chapter-36/README.md)备份、恢复非空副本，预期名例如 epp_ch42_verify，停旧 API 写入。DBeaver 记录本轮旧意图的 ID、用途、签发时间与消费标志。`.env.database-verify` 的 DATABASE_URL 与 `.env.test` 的 TEST_DATABASE_URL 指向同一副本。Node 24.22.1 下运行 `npm ci`。
2. 清除外层覆盖，执行下面的迁移、状态与构建命令。专用空库用 bootstrap 替换 deploy。旧库记录按原值保留，首次升级后发件箱为空。旧邮件能在原有效期内确认，漏寄的旧申请过冷却后由用户重新申请。
3. 按前章 VERIFY 开发命令启动 API，**最后一个库名参数换为本轮预期名**。采用相同 3360、SMTP 1025 和网页 8025 端口。发送 01，在一分钟内重发，运行[观察 SQL](01-observe.sql)，同一签发只增加一个 message_id。可停止 API，再启动本机 Mailpit。
4. 在另一个终端从下面的 send-one 命令开始，用刚才查出的 ID 寄一封。输出 accepted 后在 Mailpit 读令牌；再跑同一 ID 输出 empty。重启 API，发送 02、03 验证成功与重放拒绝。06 与 07 之间重复寄信。集合中的密码、令牌只留在本地未同步环境。其他旧章节操作按对应分支的行为阅读。
5. pending 可由独立进程接手；过期、取代或缺失的意图会使任务变为 obsolete。unknown 或残留 attempting 时先查收件端，禁止直接重置为 pending；冷却后重新申请新一轮。省略消息 ID 会在整个目标库挑选一条。第 36 章的过期意图清理仍可使用，任务记录需另设保留期。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL LOCAL_SMTP_PORT DB_QUERY_DEBUG
verify_db=epp_ch42_verify
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy "$verify_db"
npm run db:verify -- migrate status
npm run check
# 发送注册或重置申请、查到 pending 后，单独执行
message_id='换成观察 SQL 返回的消息 UUID'
NODE_ENV=development LOCAL_SMTP_PORT=1025 node --env-file=.env.database-verify \
  dist/src/send-one.js "$verify_db" "$message_id"
```

若使用 bootstrap 空库，新注册本身无需初始用户，全套回归沿用前章固定虚构用户；仅在刚建的独立测试库执行 `INSERT INTO public.users(id, web_enabled) VALUES ('10000000-0000-4000-8000-000000000001', true) ON CONFLICT (id) DO NOTHING;`。清除外层 TEST_DATABASE_URL，检查 .env.test 的隔离连接后运行 `npm test`。生产产物在干净目录安装 `npm ci --omit=dev`，环境注入 DATABASE_URL、CURSOR_HMAC_KEY、APP_ORIGIN、LOCAL_SMTP_PORT。API 用 `npm start`；一次性程序用 `NODE_ENV=production node dist/src/send-one.js 预期库名 消息UUID`。二者均不读取开发环境文件。SMTP 只连接本机。
