# 第54章本地模拟供应商

这是选读54的完整源码入口，从53的隔离副本继续。退出本章后，第55章仍从 `part-06/chapter-53` 接续。本地模拟供应商只能证明请求、SMTP接受、签名和本地数据库处置；没有外部Resend账号、域名或收件箱送达的证明。生产适配器的官方URL不变，只有本目录独立脚本显式注入的请求函数把该URL映射到本机HTTP服务器。

先停止旧API、Worker、单笔工具及其开发监听器。不要让53的Worker抢走本章指定任务。保留原库与备份，按[数据库说明](../../database/chapter-54-mail-delivery/README.md)在隔离副本升级；空库使用正式 `bootstrap`，已有53库用 `deploy`。每个新终端先运行 `unset DATABASE_URL TEST_DATABASE_URL SHADOW_DATABASE_URL DB_QUERY_DEBUG`，再加载各自私有env文件。下面所有终端都在本分支仓库根目录，使用Node24.22.1，先 `npm ci && npm run check`。原API继续使用既有私有配置、密码哈希占位和会话配置；本地模拟供应商不替代这些准备。

先准备回环Mailpit：SMTP `127.0.0.1:1054`、私有网页 `127.0.0.1:8054`。若已有实例使用别的回环端口，稍后只改私有JSON中的数字 `smtpPort`。Mailpit的安装与启动参见书稿环境说明。本章不自动启动、删除或清空邮箱。邮件含真实合成验证令牌，不在共享屏幕或观察页显示。

```bash
unset DATABASE_URL TEST_DATABASE_URL SHADOW_DATABASE_URL DB_QUERY_DEBUG
mkdir -p .mail54-private
chmod 700 .mail54-private
umask 077
# 用编辑器建立 .mail54-private/database.env，只保存本次隔离库连接：
# DATABASE_URL=postgresql://OWNER:PRIVATE_PASSWORD@127.0.0.1:55432/epp_ch54_verify
# DB_QUERY_DEBUG=false
chmod 600 .mail54-private/database.env
# 若是新的空库（必须先创建独立库）：
node --env-file=.mail54-private/database.env scripts/deploy-verify.mjs bootstrap epp_ch54_verify
# 若恢复的是53的非空库，则上面一行改成 deploy，不要两条一起跑。
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs init .mail54-private/lab.json epp_ch54_verify
```

`init` 先连接并核对实际库名、迁移探针，再创建0600文件，已有文件时拒绝覆盖。每条lab命令均核对JSON中的库名、连接实际库名，再继续；错误库不会发信、写事件或改业务。连接只准localhost/127.0.0.1。随机本地API key和Svix密钥只在私有文件内；不要用真实供应商密钥替换。默认固定scope `local-ch54`、endpoint `local-ch54-receipts`，发件人 `EPP local <sender@example.test>`，收件人 `a54@example.test` 与 `b54@example.test`。不要把真实邮箱加入配置。默认供应商3454、观察3554、回执3354、SMTP1054，均只回环；若端口冲突，用编辑器改JSON中的数字，四项必须不同，再启动进程。生产无本地URL配置项。

```bash
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs receipts-env .mail54-private/lab.json epp_ch54_verify .mail54-private/receipts.env
# 终端一：正式回执进程（只需要私有签名配置，不需要发送API key）
node --env-file=.mail54-private/receipts.env dist/src/mail-receipts.js epp_ch54_verify
```

终端二按原API私有配置启动正式API。导入[54章请求集合](../../requests/chapter-54-mail-delivery.postman_collection.json)，`baseUrl` 只填你信任的本机API。单独发送甲地址注册申请，预期202。公开202不泄露账号或outbox ID；在同一隔离库按地址、时间找到本次ID，不能把预设UUID插入业务表来代替申请：

```sql
SELECT id,intent_id,recipient,status,available_at
FROM verification_outbox
WHERE current_database()='epp_ch54_verify' AND recipient='a54@example.test'
ORDER BY available_at DESC,id DESC LIMIT 5;
```

把本次真实ID存入自己终端变量 `OUTBOX_ID`，每次新申请均重新核对；遵守既有邮箱冷却和共享额度，必要时等待，勿靠删除业务行跳过。只允许把配置中合成地址的真实任务加入观察范围：

```bash
OUTBOX_ID=REPLACE_WITH_ACTUAL_OUTBOX_UUID
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs track .mail54-private/lab.json epp_ch54_verify "$OUTBOX_ID"
# 终端三：启动本地模拟供应商和只读观察页。track新ID后要停止并重新运行serve。
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs serve .mail54-private/lab.json epp_ch54_verify
```

在本机浏览器地址栏打开 `http://127.0.0.1:3554`。它只读配置中固定任务、对应attempt/event和两地址的epoch/release，显示真实回执HTTP码，不接受URL、SQL或任意任务查询。没有邮件正文、令牌、Cookie、密钥或SQL代理。点击读取当前事实刷新。CLI `inspect` 提供同一固定视图：

```bash
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs inspect .mail54-private/lab.json epp_ch54_verify
# 终端四：通过真实sendOne和ResendDelivery，只发送指定任务。
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs send .mail54-private/lab.json epp_ch54_verify "$OUTBOX_ID" accepted
```

观察outbox accepted、attempt的同一个小写provider UUID，并在私有Mailpit读该邮件的 `X-EPP-Attempt-ID` 与 `X-EPP-Local-Provider-ID`。本地SMTP真正接受后，HTTP才返回合成provider UUID。若需消费令牌，沿集合03与第42章既有确认格式操作；不要将填好的令牌/密码导出或截图。本地模拟供应商不提供公开确认网页。

## 一封已接受邮件，后来永久退信

```bash
# 先保存较早sent事实，稍后才发送；不要在bounce之后再生成所谓“旧sent”。
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs event .mail54-private/lab.json epp_ch54_verify "$OUTBOX_ID" email.sent .mail54-private/old-sent.json
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs event .mail54-private/lab.json epp_ch54_verify "$OUTBOX_ID" email.bounced .mail54-private/bounce.json
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs replay .mail54-private/lab.json epp_ch54_verify .mail54-private/bounce.json
# 同身份同原始正文重复：HTTP204，事件和地址效果只出现一次。
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs replay .mail54-private/lab.json epp_ch54_verify .mail54-private/bounce.json
# 错签：HTTP400，不新增事实。
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs replay .mail54-private/lab.json epp_ch54_verify .mail54-private/bounce.json wrong
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs replay .mail54-private/lab.json epp_ch54_verify .mail54-private/old-sent.json
```

事件文件保存原始正文和签名头，0600独占创建，不覆盖。`replay`保留事件ID与正文，按当前秒重新签名，因而跨官方时间窗后仍能演示重复身份；它不篡改事件发生时间，不关闭正式时间窗。需要测试签名过期可用已保存的原始头手动发送。旧sent只增加历史事实，不能清除退信；outbox仍accepted。也可生成email.delivered、email.delivery_delayed或email.complained，不能把delivered称作用户阅读。

再次经API申请甲地址、track并重启serve，单笔send应返回suppressed：新任务dead/address-suppressed，未增加尝试、未旋转令牌、未联系SMTP。经API申请乙地址并track，accepted仍可发生。

## 人工恢复、旧代次与新事故

```bash
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs admin-release .mail54-private/lab.json epp_ch54_verify a54@example.test .mail54-private/release.json
# 核对文件的recipient/expectedEpoch/操作UUID，正式人工入口执行：
node --env-file=.mail54-private/database.env dist/src/mail-admin.js epp_ch54_verify release .mail54-private/release.json
# 原操作重放必须仍返回原epoch。
node --env-file=.mail54-private/database.env dist/src/mail-admin.js epp_ch54_verify release .mail54-private/release.json
```

重放原bounce仍204且不重复封锁。为旧attempt再生成一个新的email.bounced身份并发出，观察historical、不封锁。再经API新申请甲地址（冷却后），track、重启serve并accepted；为这个新OUTBOX_ID生成新bounce，新的epoch可再次blocked。恢复本地地址不会改变供应商自身的抑制名单。

## SMTP已收到，HTTP应答丢失；回执早于绑定

对新的甲/乙任务，用 `send ... "$OUTBOX_ID" lost` 替代accepted：真实Mailpit已收到，但HTTP连接被主动中断，send退出2、outbox unknown、channel.paused_by保持事故ID，没有凭空假定accepted。私有 `provider-ATTEMPT_UUID.json` 只保存对账ID和合成收件人，不含邮件/令牌。`early` 模式在SMTP接受后先发一个签名永久退信（正式回执HTTP204、未匹配），再丢失HTTP应答；观察页显示同一provider ID及未匹配事件。

```bash
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs send .mail54-private/lab.json epp_ch54_verify "$OUTBOX_ID" early
node --env-file=.mail54-private/database.env examples/mail-delivery/lab.mjs admin-bind .mail54-private/lab.json epp_ch54_verify "$OUTBOX_ID" .mail54-private/bind.json
# 核对私有provider记录、Mailpit头和attempt，再实际绑定：
node --env-file=.mail54-private/database.env dist/src/mail-admin.js epp_ch54_verify bind .mail54-private/bind.json
```

绑定后，早到事实关联到同一attempt并封锁地址；outbox仍unknown、channel仍paused。早到事件的私有文件为 `early-ATTEMPT_UUID.json`，可用replay再次发送，身份保持。乙的新任务此时也只能paused，地址release和收到delivered都不会放行通道。

停止所有发送者（保留观察/回执即可），保存原事故证据并明确处置，再用[带channel锁的53人工门槛](../../database/chapter-54-mail-delivery/review-channel.sql)恢复新任务的通道：

```bash
# 必须把实际主机/端口/身份/库和原事故ID填准。此步骤只解除指定事故的通道，不重寄旧任务。
psql -h 127.0.0.1 -p 55432 -U OWNER -d epp_ch54_verify -v expected_db=epp_ch54_verify -v incident_id="$OUTBOX_ID" -f database/chapter-54-mail-delivery/review-channel.sql
```

最后对照[按原ID观察SQL](../../database/chapter-54-mail-delivery/observe.sql)与[有界终态清理](../../database/chapter-54-mail-delivery/README.md)，不删除证据行腾容量。各终端Ctrl-C结束自己的API、回执和本地模拟供应商；不要停止共享PG。需要保留私有Mailpit供确认时先完成确认，再按环境章节停止本次实例。私密目录不提交，截图只取观察页。
