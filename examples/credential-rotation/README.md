# 两个 API 实例的凭据轮换练习

从第 74 章恢复并在第 81 章沿用的**私有回环 HTTP 环境**出发。仓库根目录运行 `nvm use`、`npm ci`、`npm run build`。已有这一平台和版本的交付产物，可继续用原 release。没有新迁移。以下示例的数据库是第 81 章停机集群的**独立副本**：角色是集群级对象，仅在原实例里新建数据库仍会改动原来的登录权限。

### 先记下原身份和业务基线

从部署记录取得预期端点、库名、旧账号 ID 和操作 ID。API 的 `epp_api`、邮件的 `epp_mail`、通知的 `epp_notify`、收据查询的 `epp_receipt74` 和清理的 `epp_cleanup` 均应为普通、已按前章收窄的角色。换过名字时先修改下列 SQL 的映射。在副本中停妥其他发送者与调度器，保留同恢复点的桶和私有 Mailpit。正式客户端保留旧收据、邮件占用和业务基线，另存可恢复的旧配置。

在目标实例的管理员 psql 中，先核对 `\conninfo`，在配套根目录设置 `\set expected_db epp_ch73_handoff`（改为独立取得的库名），再执行 `\i examples/credential-rotation/identities.sql`。[建新登录](identities.sql)仅用于这份副本。脚本不带密码，事务中有同名角色就停止。新角色没有口令时尚不能通过密码认证；在这个交互会话依次运行：

```text
\password epp_api_v2
\password epp_mail_v2
\password epp_notify_v2
\password epp_receipt_v2
\password epp_cleanup_v2
```

每次交互输入该角色新生成的独立口令。确认实例的回环 TCP 连接由 `scram-sha-256` 认证。每份新配置从**对应角色**的旧文件复制，修改 `DATABASE_URL` 的登录名与口令并编码 URL 保留字符，保留库名、连通路径和该进程的其他配置。API 数据库试切期间两端仍用原 `CURSOR_HMAC_KEY`。签名试切时，单独生成一次 32 字节随机值（64 位十六进制）保存在私有文件中，A 和 B 使用同一份新值。秘密不进命令行、Git 或共享请求集合。每个配置按第 73 章设置 root 为属主、对应服务组可读、模式 0640，保留登录管理员的独立观察通路。[各角色及其启动路径](../portable-release/README.md)

### 给两个实例明确的去向

A、B 的工作目录可写且彼此独立，两份生产 API 配置中的 `LISTEN_HOST=127.0.0.1`，`PORT` 分别为 3376、3377。`APP_ORIGIN=http://127.0.0.1:13376` 在两份文件中完全相同。若使用第 73 章交接的原回环来源，可把 13376 全部换成原公开端口（并沿用匹配的 Cookie）。只有回环练习使用这份 HTTP 配置。远程部署时从操作端单独开 SSH 窗口：

```bash
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:13386:127.0.0.1:3376 \
  -L 127.0.0.1:13387:127.0.0.1:3377 epp-lab
```

在操作端另开 Bash，进入配套根。两实例就在同机时把下面的 port_a、port_b 换成 3376、3377。这里 curl 使用固定 URL，`--connect-to` 只改变实际拨号的回环端口。故意不同步的实例只接练习探针。

```bash
umask 077
lab=$(mktemp -d)
site=http://127.0.0.1:13376
port_a=13386
port_b=13387
. examples/credential-rotation/client.sh
```

在这两个回环探针上使用 HTTP 时，Cookie 应来自本轮 HTTP 登录。`__Host-` 前缀的 HTTPS Cookie 留在第 74 章的客户端。

在私有目录中用编辑器创建 `$lab/login.json`，形如 `{"userId":"自己的练习用户 UUID","password":"该用户的练习口令"}`。确认该用户已有至少两条未清除的站内通知；若不足，用第 55 章的注册、密码重置与通知消费准备练习账号，两条通知出现后再登录取样。若副本带着尚未解除的邮件占用，没必要为了凑两条分页记录改变邮件现场。可以只在隔离库内准备通知样本：核对账号 UUID 后，用有权写练习数据的管理员在 psql 执行下列语句（在原 `expected_db` 会话中设置 `\set sample_user 实际账号UUID`）。记下返回的两个任务 ID，只做一次。

```sql
INSERT INTO public.notification_jobs(id,user_id,kind)
SELECT gen_random_uuid(), u.id, 'registered'
FROM public.users u CROSS JOIN generate_series(1,2)
WHERE u.id = :'sample_user'::uuid AND u.status = 'active'
  AND current_database() = :'expected_db'
RETURNING id;
```

这是合成的分页样本。按第 72 章以旧通知身份短暂启动通知 Worker，确认两个 ID 均已进箱，再停妥它。先检查队列只有预期的待办，避免顺便消费故障对照要保留的任务。第 82.3 节用于验证新消费者的那笔任务仍由真实注册确认产生。

先启动两份旧配置，再执行：

```bash
hit A /auth/login login-response -c "$lab/cookies" -H "Origin: $site" \
  -H 'X-EPP-Request: 1' -H 'Content-Type: application/json' --data-binary "@$lab/login.json"
hit B /profile/me me -b "$lab/cookies"
save_proofs B old
```

前两条应为 200。`save_proofs` 保存当前会话的 CSRF 和第一页的下一页游标。写入失败时检查返回值，尤其注意 `nextCursor` 是否为空。[定向请求函数](client.sh)只覆盖这次探测。

在 `$lab/capture.json` 写入 `{"originalText":"本轮独有的短标记","chineseIntent":"轮换对照"}`，把标记换成本轮的值。随后每次成功写入换一个标记。A 改用新签名密钥、B 仍用旧密钥时，在同一个 Bash 运行：

```bash
save_proofs A candidate
write_capture B candidate rejected.json
next_page B candidate rejected-page.json
next_page A candidate accepted-page.json
```

读取响应 JSON 的 `code` 和库中标记的计数。B 修复后分别执行 `save_proofs A anew` 和 `save_proofs B bnew`。取 A 的 `anew` 到 B 写入、取 B 的 `bnew` 到 A 写入，分别在另一端读回素材，再把两个新游标交给另一端翻页。用 `old` 在每台实例各试一次写入和续页。结束时关闭练习客户端、清理该临时目录中的登录材料与会话。

### 哪些文件在运行时取证

- [会话观察 SQL](activity.sql)可在 DBeaver 执行。连接两个 API 的同一数据库观察账号，自动提交下刷新；查询保留了其他库的行，便于发现意外交叉使用。
- 新通知身份刻意漏掉收件箱 INSERT。正常领取事务应整体回滚：同一 job 仍 pending，收件箱没有该 ID。核对 PG 错误及列授权后，在原管理员 psql 执行 `\i examples/credential-rotation/repair-notify.sql`，再启动同一入口消费原任务。[恢复正式通知授权](repair-notify.sql)
- [按角色启动、只读收据与退出](../portable-release/README.md)、[邮件占用处置](../../database/chapter-45/README.md)、[清理任务单笔运行](../maintenance/README.md)都沿用原来的入口。正文 82.4 在验证新配置后禁止旧登录并观察仍活着的旧会话。留存原角色作为权限来源，撤销其登录与删除角色产生不同结果。
