# 第46章　可查询的站内通知

从 `part-06/chapter-45` 继续，本章为 `part-06/chapter-46`。使用 Node 24.22.1、本机 PostgreSQL 18、Mailpit 和本章的[Postman 集合](../../requests/chapter-46.postman_collection.json)。01～12 沿用前章编号，13～18 操作站内通知。按次单发，不要将整套串行执行。

1. 在第45章独立 VERIFY 停写、停止所有 Worker 和 watcher，将备份恢复到 epp_ch46_verify。在 DBeaver 先执行[观察 SQL](01-observe.sql)前四条，记录旧用户、邮件状态和占用。三个环境文件沿用[第44章说明](../chapter-44/README.md)，分别设置 .env.database-verify / .env.worker 的 DATABASE_URL 与 .env.test 的 TEST_DATABASE_URL。参数里的预期库名应来自独立的建库记录。若使用其他隔离库名，运行命令和本章两个带库名保护的 SQL 一并替换。
2. 从项目根运行下列命令。独立空库第一次把 deploy 换成 bootstrap；非空恢复库只能 deploy。再查相同四条，新表应出现，旧行原值保持。首次升级两张新表均为空；已跟做过则按本轮 ID 对照。旧账号可用原登录方式查询空收件箱。
3. 启动本机 Mailpit。沿用[第43章 API 终端命令](../chapter-43/README.md)，末尾换成 epp_ch46_verify，集合 baseUrl 对应 API，默认 3360。用本地、未同步环境设置 email、password、newPassword、registrationToken、resetToken 和 csrfToken；两个密码须不同，符合原密码政策。邮件进程使用下方 mail 命令，.env.worker 的 SMTP 端口要与练习 Mailpit 相同。先不开通知进程。若旧库邮件通道占用，先按第45章处理或另用空 VERIFY。
4. 01 申请注册，用 Mailpit 本轮信件的令牌发 02，响应 201。03 重放为400，04 未开通登录为403。按[第36章开通 SQL](../chapter-36/02-grant-fixture.sql)用本轮 UUID **和邮箱**放行并提交，05 登录。13 首页应为空。06 请求重置，用新收到的令牌发 07；08 原 Cookie 为401，10 新密码登录。用观察文件末条按 02 返回的 userId 筛选，两条 pending，右侧都没有通知。
5. 保留 API、停止开发邮件 watcher，改用下方 notifications 命令。观察同两行 done，13 取 limit=1 首页，14 继续尾页。13 会替换集合中的 notificationId、notificationCursor；不用尾页游标时回到13。15 把当前会话的令牌保存到本地环境；16 标记第13步选定的通知，18 回查 readAt；再发16首次时间保持。17 清除，18 再查，16/17 都可重复。18 不改操作目标。Cookie 换过后重发15。避免同名环境变量遮住集合保存的 notificationId、notificationCursor、userId。
6. 停通知 Worker，在本章 VERIFY 用[演示重放](02-replay-cleared.sql)，确认替换的是刚清除的 ID，手动提交模式记得提交。重启后同一行 done、旧 read_at 与 cleared_at 保持，18 中不会重现。再停通知 Worker，执行[两个变更条件样本](03-late-jobs.sql)并提交，记录两个新 ID。重启后应均为 obsolete，均无通知。用于诊断时，VS Code 附加 Worker 9230，在 notification-job.ts 取得 job 后观察 ID，立即继续；若超事务期限而退出，先查两张表再重启。
7. 两个工作角色可同时通过构建产物运行，各自持有连接池。不要同时运行两份共用 .worker-dev 和 9230 的开发 watcher。生产目录安装 npm ci --omit=dev（复制 dist、package.json、package-lock.json、.npmrc）。API 注入 API 配置、npm start；每个 Worker 注入 DATABASE_URL 和本角色配置，在自己的终端执行 npm run start:worker -- epp_ch46_verify 或 npm run start:worker -- epp_ch46_verify notifications。通知角色不使用 SMTP、Cookie 签名密钥或 APP_ORIGIN。两者均前台串行处理和排空。开发结束分别停本轮进程，清除本地环境中的秘密。独立回归库沿用[第42章固定测试用户](../chapter-42/README.md)。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG
npm ci
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch46_verify
npm run db:verify -- migrate status
npm run check
```

```bash
# mail，先在 Worker 终端清除会盖过 .env.worker 的值
unset DATABASE_URL DB_POOL_MAX DB_QUERY_DEBUG LOCAL_SMTP_PORT LOG_LEVEL
npm run dev:worker -- epp_ch46_verify
# 停掉上一条 watcher 后，在同一终端切换为站内通知
npm run dev:worker -- epp_ch46_verify notifications
```
