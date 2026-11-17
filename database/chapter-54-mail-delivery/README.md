# 第54章：发送观察、签名回执与地址恢复

从已发布 `part-06/chapter-53` 在独立副本升级，本章选读分支为 `part-06/chapter-54`，55 仍沿 53。先停止旧写入者、备份并恢复非空库，记录实际库名；空库用 `bootstrap`，非空库用 `deploy`。Node 固定 24.22.1，`npm ci` 安装锁定 Svix 2.10.0。不要直接对空库运行 Prisma 的字母序 deploy；使用既有基线入口。

```bash
npm ci
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch54_verify
npm run check
```

迁移仅增加四张证据表及 `address-suppressed` 分类，旧行不回填虚构尝试。attempt 的 outbox/intent UUID 是历史快照，无外键；event→attempt、address/release→event 为 RESTRICT。旧任务按终态、30天和非 paused 条件清理后，事实仍保留至本次隔离练习结束。生产留存政策须另定，不能删除已接受事件腾出容量。

复制 [Worker 样例](worker.env.example) 为 `.env.worker`、[回执样例](receipts.env.example) 为 `.env.receipts`，均设 `chmod 600`。Worker 的 `MAIL_PROVIDER_SCOPE` 与接收端必须相同，它是稳定非秘密账号别名；endpoint scope 标识回执入口，换签名密钥不要改 scope。API 沿原配置，不加载签名或发送密钥。回执不需要发送 key。默认只监听回环3354；真实平台需要受控公网 HTTPS 转发到唯一 `POST /webhooks/resend`，本目录没有部署或分权已验证的承诺。

```bash
npm run dev:worker -- epp_ch54_verify
npm run dev:receipts -- epp_ch54_verify
# 独立生产终端分别注入配置后运行：
npm run start:worker -- epp_ch54_verify
npm run start:receipts -- epp_ch54_verify
# 单笔入口：
node --env-file=.env.worker dist/src/send-one.js epp_ch54_verify MESSAGE_UUID
```

API、Worker、回执的开发产物分别为 `.dev`、`.worker-dev`、`.receipts-dev`，Inspector 分别9229、9230、9231，均启用 source maps。生产仅运行 dist，不把作者替身放入生产入口。SIGTERM 回执停止接新请求，等待在途处理并关闭数据库，10秒超时退出1。

Resend 固定 HTTPS endpoint、单 to、5秒超时和64KiB响应，无自动重试。只有完整2xx且合法UUID id 才是 accepted；其余均 unknown，沿53全通道停发。SMTP原有三类安全失败及最多三次重试不变。SMTP Message-ID 不是 Resend email_id。发送接受、服务器送达、退信及业务确认是独立事实。

签名针对原始字节，身份去重先于100事件容量判断。单 provider/scope/message 已接受100个不同事件后，新身份503、不保存；重复仍成功。同事件ID不同摘要409。永久退信还必须 bounce.type=Permanent；Temporary/缺类型只保留，待核对。单一收件人规范化后严格相同才施加地址效果。恢复递增 epoch，旧尝试的迟到事故为 historical，新尝试可再次阻止。回执和人工操作都不改 outbox.status/paused_by。

人工核对供应商详情与 attempt 元数据后，准备私有0600 JSON文件（不放令牌、API key、完整邮件或webhook），运行：

```bash
node --env-file=.env.receipts dist/src/mail-admin.js epp_ch54_verify bind /private/path/bind.json
node --env-file=.env.receipts dist/src/mail-admin.js epp_ch54_verify release /private/path/release.json
```

bind 请求为 `{ "attemptId":"UUID", "providerScope":"practice-account", "providerMessageId":"UUID", "actor":"operator", "reason":"reviewed", "evidenceRef":"case-54-1" }`。只能从未绑定到一次绑定，不准凭邮箱猜测。release 请求为 `{ "id":"operation-UUID", "recipient":"controlled@example.test", "expectedEpoch":"0", "actor":"operator", "reason":"reviewed" }`。同操作及输入重放只返回原代次；不同输入或错旧代次拒绝。stdout 只输出ID/epoch/result，错误不打印原始材料。目标库名在任何变更前核对。恢复本地地址不代表供应商自己的 suppression 已解除；全通道unknown仍按53独立核对。

全部新写事务先锁 channel 行，maxWait 2秒、timeout 5秒；不要绕过锁直接改 paused_by。旧53人工停发恢复SQL用于本章时，也必须先锁这行。验证仅用独立测试库：显式 `TEST_DATABASE_URL`、既有固定测试用户，再运行 `npm test`。本地签名替身能证明协议、持久化和恢复顺序，不能证明外部供应商投递或收件箱到达。

订阅范围只选上述五类邮件事件。其他仍具有合法 `data.email_id`、顶层 `created_at` 的有界邮件事件可保存为 unsupported；不具备邮件身份的联系人、域名等无关事件返回400，不伪造 provider ID。发送方API响应绑定ID与人工绑定都不会自动解除 unknown。

需要实际清理旧终态任务时，先按本地保留政策审查；[有界清理入口](cleanup.mjs)先核对预期库名，再锁 channel，每次最多100条，沿53保留条件删除：

```bash
node --env-file=.env.receipts database/chapter-54-mail-delivery/cleanup.mjs epp_ch54_verify
```
