# 第66章：缺修订记录的巡检与恢复

从 `part-08/chapter-65` 的非空独立副本接续，完成代码在 `part-08/chapter-66`。沿用 Node 24.22.1 / PostgreSQL 18；无新增依赖，新增迁移 `20261118010000_capture_integrity`。完整操作与判断见[正文](https://github.com/SamChowRock/EPP-Book/blob/main/part-08-maintenance/chapter-66-bad-data/chapter.md)。

在 `epp_ch66_source` 的两个已开通合成账号下，用正式 API 建立 healthy、recoverable、unproven 三个样本和另一账号的一个正常样本；recoverable 追加到第2版。保持原 Cookie，先停写并备份，再恢复到独立 `epp_ch66_verify`，逐值确认父记录和全部修订。只为 recoverable 审批一份修复依据，unproven 在本轮保持未审批；不要用父表初始文本制造首版。

DBeaver 打开 [failure.sql](failure.sql)，替换本轮 recoverable/unproven 两个 ID，仅在专用合成库执行故障注入。外键冲突时回滚，换无候选、回执的全新样本；不移除约束。用 [inspect.sql](inspect.sql) 逐条观察，不整份执行。

切换新代码、`nvm use`、`npm ci`、`npm run check`。用私有 `.env.ch66` 保存该库 DATABASE_URL；Shell 外层同名变量不能覆盖预期目标：

```bash
env -u DATABASE_URL node --env-file=.env.ch66 scripts/deploy-verify.mjs deploy epp_ch66_source
```

API 使用自己的同库配置与原 APP_ORIGIN、签名密钥、Cookie；维护 CLI 不读取 `.env` 默认文件。以下 `SCAN_ID` 为本轮新 UUID，`CASE_ID` 来自扫描的 finding.id，**不是 capture_id**。每次 scan 至多1000条，可中断后用同一 SCAN_ID 继续；finished 仅表示这一轮按主键走完，随机 UUID 不是持续增量水位。

```bash
SCAN_ID=$(node -e 'console.log(crypto.randomUUID())')
env -u DATABASE_URL node --env-file=.env.ch66 dist/src/manage-capture-integrity.js start epp_ch66_source "$SCAN_ID"
env -u DATABASE_URL node --env-file=.env.ch66 dist/src/manage-capture-integrity.js scan epp_ch66_source "$SCAN_ID" 1
# 重复上条至 finished:true，保存输出中的案件 ID，逐个复核后执行：
env -u DATABASE_URL node --env-file=.env.ch66 dist/src/manage-capture-integrity.js quarantine epp_ch66_source "$CASE_ID"
```

API 对本人坏记录的详情、修订和写操作返回503/CAPTURE_DATA_UNAVAILABLE；他人404。旧 GET /captures 无法表达不完整，因此503；分页返回健康记录和 complete:false，hasMore:false 只表示可读条目到末页。[Postman集合](../../requests/chapter-66-integrity.postman_collection.json)先配置账号、密码、本轮ID，登录并获取CSRF，逐个发送，不用 Runner 连发所有请求。

在只读恢复副本中导出 recoverable 的全部原修订。`.env.ch66-verify` 只含 VERIFY 连接，文件放 Git 之外；命令拒绝覆盖文件。先复核备份来源、时间和完整历史，再记录输出 SHA。

```bash
umask 077
EVIDENCE_DIR=$(mktemp -d)
env -u DATABASE_URL node --env-file=.env.ch66-verify dist/src/manage-capture-integrity.js export epp_ch66_verify "$CAPTURE_ID" '本轮已核对的故障前备份' "$EVIDENCE_DIR/revisions.json"
env -u DATABASE_URL node --env-file=.env.ch66 dist/src/manage-capture-integrity.js repair epp_ch66_source "$CASE_ID" "$EVIDENCE_DIR/revisions.json" "$APPROVED_SHA256"
```

修复锁住父记录和案件，核对当前父字段与已审批依据、无修订、隔离状态；原ID/序号/时间/内容全量插入、依据记录与解除隔离同事务。重复同依据返回 replay:true；证据不同、父字段已改、插入冲突一律拒绝并回滚。摘要只证明文件没换，不能证明历史真实完整。已恢复后正常追加不影响对恢复前缀的重复核验。

API 仅读取案件 id/capture_id/state；维护角色能读取父子表、锁父行、写案件/扫描/修复记录及插入修订。当前练习沿用数据库所有者；进入后续最小权限部署时，按该阶段角色SQL执行，勿给 API 管理权限。只支持“全部修订缺失”；有修订但内容错、归属不明、候选依赖受损需要另外定义规则与消费路径，不能直接扩用隔离标记。

回归：在独立测试库部署全部迁移后设置 TEST_DATABASE_URL，运行 `npm test`；`npm run ci:check` 核对类型和契约。关闭本轮 API、断开 DBeaver 后保留专用库、备份及审批依据以便续做；删除临时明文登录凭据，证据按业务保留策略管理。
