# 第45章　在本机辨认可以再寄的邮件

从 `part-06/chapter-44` 继续，本章分支为 `part-06/chapter-45`。全部命令从配套项目根目录运行。Node 24.22.1、原生 PostgreSQL 18、DBeaver、Postman 和回环 Mailpit 沿用前章。

1. 停止旧 Worker、watcher 和寄信 CLI。备份停写的第44章非空 VERIFY 并恢复到独立的 `epp_ch45_verify`。在 DBeaver 执行[观察文件](01-observe.sql)开头三条，保存旧行和通道原值。三个环境文件沿用[第44章配置](../chapter-44/README.md)，统一换成本章实际库名。设置 .env.worker 中 LOCAL_SMTP_PORT=1045。升级和构建如下。独立空库将 deploy 换成 bootstrap。升级后重查旧行、控制行及新列。旧占用仍须先核对才能放行。
2. 按[第43章 API 终端命令](../chapter-43/README.md)启动，末尾参数改为 epp_ch45_verify。Postman 导入[原集合](../../requests/chapter-43.postman_collection.json)，baseUrl 指向本轮 API 的回环地址，单发 01，每轮换虚构邮箱。DBeaver 按收件人找到消息 ID。此时不要开持续 Worker。端口 1045 空闲时，用下方 once 投递，返回 retry-scheduled；立即再运行应为 empty（若已过期，以实际时间为准）。启动 Mailpit 后，过 available_at 再取同一 ID，应 accepted、attempts=2，邮箱里一封。也可用 02 确认这个令牌。命令中的 8045 为本次独立邮箱网页端口。
3. Ctrl-C 关闭此 Mailpit。另开终端运行 `node database/chapter-45/smtp-lab.mjs defer 1045`。用新地址发 01。确认库里只剩允许实际投递的待办后运行 `npm run dev:worker -- epp_ch45_verify`，第一次 retry-scheduled 后 Ctrl-C 并重启。观察同一 ID 最终 dead、attempts=3。结束 watcher 和故障端。再用 reject 替换 defer，用新消息单发 once，应一次 dead。切换模式必须先关闭旧进程，等待新窗口出现 ready。
   随后改用 `node database/chapter-45/smtp-lab.mjs quota 1045`，先后用两个本轮新地址发 01，A 使用 `a@quota.example.test`，B 使用 `b@example.test`（重做时换两个本地部分）。查出两个消息 ID，依次各跑一次 once。故障端对 A 的唯一 RCPT 回 552 5.2.2；数据库应为 dead、一次、recipient-refused，通道开放。B 仍在同一端口得到正文结束后的 250，库中 accepted、一次。该实验端丢弃正文。
4. 用 drop 模式处理又一条新消息。故障端只输出收到正文结束符，发送侧报告 unknown。再排一条消息，重启 Worker，应 paused 并退出处理，后继保持 pending。停止所有发送者及故障端，恢复 Mailpit，按正文核对并保留证据。执行[人工放行](03-review.sql)前替换预期库名与实际故障 UUID。一次返回一行，重做零行，原行仍为 unknown，若只批准尝试这一条后继，保持持续 Worker 停止，仅对后继 ID 运行 once。按两个 ID 复查原行 unknown 一次、后继 accepted 一次，恢复后的 Mailpit 内只新增后继邮件。共享通道出现跨地址的同类异常时，保持其余工作暂停，排查故障后再恢复持续 Worker。
5. [清理 SQL](02-clean.sql)每次最多取100条，默认仅当前库、终态且达到30天。先在 DBeaver 手动事务中执行并回滚核对候选，再按保留政策执行和提交。unknown、attempting 另行复核、记录处置及留存期限。离开前结束本轮 watcher、API、故障端和邮件进程。

```bash
unset DATABASE_URL TEST_DATABASE_URL SHADOW_DATABASE_URL DB_QUERY_DEBUG
npm ci
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch45_verify
npm run db:verify -- migrate status
npm run check
```

```bash
unset DATABASE_URL LOCAL_SMTP_PORT DB_POOL_MAX DB_QUERY_DEBUG LOG_LEVEL
once() {
  node --env-file=.env.worker database/chapter-44/race.mjs epp_ch45_verify "$1" now
}
# 用 DBeaver 查到的 UUID 替换下方参数
once '本轮消息UUID'
```

```bash
mailpit --smtp 127.0.0.1:1045 --listen 127.0.0.1:8045
```

开发调试沿用 API 9229 与 Worker 9230。交付目录复制 dist、package.json、package-lock.json、.npmrc，执行 npm ci --omit=dev，分别注入 API 与 Worker 的生产配置。API 由 npm start 启动；在 Worker 终端运行 npm run start:worker -- epp_ch45_verify。smtp-lab 是独立实验，生产包不需要它。全套回归另用已迁移的测试库和[第42章固定用户](../chapter-42/README.md)，清除外层 TEST_DATABASE_URL，再按该章说明运行 npm test。
