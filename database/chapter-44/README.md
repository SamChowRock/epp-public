# 第 44 章　在两个进程之间交接验证邮件

起点为 `part-06/chapter-43`，本章分支为 `part-06/chapter-44`。只在本机 VERIFY 和 Mailpit 操作。沿用[第 43 章 Postman 集合](../../requests/chapter-43.postman_collection.json)；HTTP 契约、消息 ID 和历史迁移不变。新增两个可空租约字段及领取索引，保留前章的故障通道。同步运行旧发送程序会绕开新协议；升级之前停掉全部 Worker、watcher 和寄信 CLI。

1. 在第 43 章隔离库留下两个虚构地址的不同状态（例如 accepted、pending）。停写并备份，恢复到新的 epp_ch44_verify。也可从已隔离的恢复副本继续，以下参数均换成建库时定下的实际名字。DBeaver 打开[观察 SQL](01-observe.sql)，升级前只执行前三条，记录每一行与通道。不要打开正文令牌或摘要列。
2. Node 24.22.1、项目根目录，运行 `npm ci`。迁移文件 .env.database-verify 的 DATABASE_URL、.env.test 的 TEST_DATABASE_URL、.env.worker 的 DATABASE_URL 指向这个库；最后一个文件可复制[前章样例](../chapter-43/worker.env.example)后改库名、凭据和 SMTP 端口。运行下面的命令。若从独立空库开始，把 deploy 换为 bootstrap；它不适用于非空库。再执行全部观察查询，验证旧 ID、状态和 paused_by 未改，新字段均为空，索引存在。开始双进程实验前应查到一行控制数据且 paused_by 为空；有旧占用先核对原事故，不能确认就保留现场，另建空 VERIFY 做实验。
3. 沿用[第 43 章 API 终端命令](../chapter-43/README.md)，**末尾传 epp_ch44_verify**；baseUrl 为 http://127.0.0.1:3360。启动只绑定回环的 Mailpit（SMTP 默认 1025、网页 8025），暂不开 Worker。Postman 改 email 为本轮新地址，发 01，预期 202；在 DBeaver 对照收件人、时间和用途取得消息 ID。
4. 两个新终端都在项目根目录，分别执行下方的 race 函数定义。第一次，A 执行 `race before` 后保持等待。B 在期限内 `race now` 为 empty；越过 lease_until 再执行为 accepted，A 按 Enter 为 stale。Mailpit 按本轮地址筛选只收到一封。若中断时还停在 pending，等租约到期可以重新领取。
5. 用新地址再发 01，两边 message_id 均换新。A 执行 `race after` 后，收件端已接受、库为 attempting。有效期内 B 为 busy，超过期限为 paused；A 按 Enter 为 lost-after-send。另排一条不同地址的 pending，在 B 中换用后继 ID，再查仍是 paused。这个互动入口用标准输出显示结果；正式 Worker 遇到 paused、unknown 或 lost-after-send 退出 2。先停所有发送者、恢复 SMTP 并核对旧信，再用[按库名和故障 ID 放行](../chapter-43/02-resume.sql)，将脚本库名替换为本章实际库名、UUID 换为对应事故，确认返回一行且已提交。只处理后面的工作，原 attempting 不重新寄送。
6. 在 DBeaver 同一会话依次执行[计划对照](02-plan.sql)，比较临时表的顺序扫、旧索引加排序与部分表达式索引。确认执行到 ROLLBACK；不会增加业务任务。交还给长期 Worker 前核对全库到期待办，开发命令为 `npm run dev:worker -- epp_ch44_verify`（先清除外层数据库、SMTP、日志变量）。生产命令沿用 `NODE_ENV=production node --enable-source-maps dist/src/mail-worker.js 预期库名`；干净目录复制 dist 和包文件、.npmrc 后安装 `npm ci --omit=dev`，不带互动脚本或开发配置。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch44_verify
npm run db:verify -- migrate status
npm run check
```

```bash
unset DATABASE_URL DB_POOL_MAX DB_QUERY_DEBUG LOCAL_SMTP_PORT LOG_LEVEL
verify_db=epp_ch44_verify
message_id='替换为刚才查询的消息 UUID'
race() {
  node --env-file=.env.worker database/chapter-44/race.mjs "$verify_db" "$message_id" "$1"
}
```

全套回归请在单独的已迁移测试库运行，.env.test 指向该库并清除外层 TEST_DATABASE_URL。空库补[前章的固定虚构用户](../chapter-42/README.md)后再运行 `npm test`；不要用仍有发送者或未处置通道故障的实验现场跑回归。
