# 两个 API 实例的凭据轮换练习

沿用第 76 章的平台制品、受限角色和配置。核对制品摘要后直接运行。客户端使用第 72 章交接的 HTTPS 名称、端口、可信根和原会话，保留一条旧素材 ID。已有会话过期时，在这个 HTTPS 来源重新登录一次。将练习入口的上游接到本次隔离副本；数据库使用第 76 章停机集群的独立副本，配对恢复对象桶。角色属于整个 PostgreSQL 实例。没有新迁移。

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

每次交互输入该角色新生成的独立口令。确认实例的回环 TCP 连接由 `scram-sha-256` 认证。每份新配置从**对应角色**的旧文件复制，修改 `DATABASE_URL` 的登录名与口令并编码 URL 保留字符，保留库名、连通路径和该进程的其他配置。API 数据库试切期间两端仍用原 `CURSOR_HMAC_KEY`。签名试切时，单独生成一次 32 字节随机值（64 位十六进制）保存在私有文件中，A 和 B 使用同一份新值。秘密不进命令行、Git 或共享请求集合。每个配置按第 71 章设置 root 为属主、对应服务组可读、模式 0640，保留登录管理员的独立观察通路。[各角色及其启动路径](../portable-release/README.md)

### 经同一 HTTPS 入口切换上游

两份 API 配置使用第 72 章的 HTTPS APP_ORIGIN，保留同一库与原签名密钥；候选 A 使用新数据库登录和独立回环端口、可写目录，原上游 B 继续工作。留存 nginx 当前配置。沿用第 72 章的入口，在部署端只改 `proxy_pass` 的上游地址，预检并平滑重载；用每次请求的 requestId 在实际 A 或 B 的日志中确认去向。两边都应经同一个 HTTPS 名称和端口访问。

在操作端恢复第 72 章的私有 Bash 会话变量，`lab` 指向保留可信根、原 cookies 的目录，`id` 是原素材 ID。使用第 72 章的 [curl 客户端](../tls-trust/README.md)验证证书链和名称。每次切换后，经入口发新请求并记录响应头中的请求 ID。

```bash
site=https://api.epp.test:8443
client=(curl -q --noproxy '*' --max-time 12 -sS --resolve api.epp.test:8443:127.0.0.1 --cacert "$lab/ca/root.crt")
"${client[@]}" -D "$lab/profile.headers" -b "$lab/cookies" -o "$lab/profile.json" -w '%{http_code}\n' "$site/profile/me"
"${client[@]}" -b "$lab/cookies" -o "$lab/original.json" -w '%{http_code}\n' "$site/captures/$id"
```

两次读取均应返回 200。在 API 日志中按请求 ID 找出处理请求的应用 PID，再用 activity.sql 核对候选启动后新建连接的库名、登录和时间。查询显示的 pid 属于 PostgreSQL 后端，与应用日志里的 PID 分属两个进程。签名密钥轮换前，用原 Cookie 取得 CSRF 和未过期的下一页游标；在维护窗口排空旧进程，为 A、B 分发同一代新签名密钥。两实例分别拒绝旧 CSRF（403）与旧游标（400）。再经此入口向 A 取新令牌和游标，切到 B 创建带唯一标记的素材、按 ID 复读并使用原分页范围续页，核对 201、200、200。换标记后反向再做一次，最后经新的 TLS 连接带原 Cookie 读回原素材。

### 在隔离库准备分页样本

确认该用户已有至少两条未清除的站内通知；若不足，用第 55 章的注册、密码重置与通知消费准备练习账号，两条通知出现后再登录取样。若副本带着尚未解除的邮件占用，没必要为了凑两条分页记录改变邮件现场。可以只在隔离库内准备通知样本：核对账号 UUID 后，用有权写练习数据的管理员在 psql 执行下列语句（在原 `expected_db` 会话中设置 `\set sample_user 实际账号UUID`）。记下返回的两个任务 ID，只做一次。

```sql
INSERT INTO public.notification_jobs(id,user_id,kind)
SELECT gen_random_uuid(), u.id, 'registered'
FROM public.users u CROSS JOIN generate_series(1,2)
WHERE u.id = :'sample_user'::uuid AND u.status = 'active'
  AND current_database() = :'expected_db'
RETURNING id;
```

这是合成的分页样本。按第 71 章以旧通知身份短暂启动通知 Worker，确认两个 ID 均已进箱，再停妥它。先检查队列只有预期的待办，避免顺便消费故障对照要保留的任务。第 75.3 节用于验证新消费者的那笔任务仍由真实注册确认产生。

### 支线 77A 的隔离 HTTP 探针

下面的 SSH 转发、HTTP 登录和 client.sh 专用于故意分裂 A、B 密钥的故障对照。在另一个停机集群副本中演练，另设端口、工作目录和配置文件。保持上节交付的 HTTPS 入口、配置与会话继续可用。

A、B 的工作目录可写且彼此独立，两份生产 API 配置中的 `LISTEN_HOST=127.0.0.1`，`PORT` 分别为 3376、3377。`APP_ORIGIN=http://127.0.0.1:13376` 在两份文件中完全相同。如选其他空闲回环端口，须同步更改本支线的 site 和两份 APP_ORIGIN，随后单独登录。只有回环练习使用这份 HTTP 配置。远程部署时从操作端单独开 SSH 窗口：

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

此处新建的 lab 与上节的 TLS 目录分开，Cookie 来自本轮 HTTP 登录。`__Host-` 前缀的 HTTPS Cookie 留在第 72 章的客户端。

在私有目录中用编辑器创建 `$lab/login.json`，形如 `{"userId":"自己的练习用户 UUID","password":"该用户的练习口令"}`。

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
- [按角色启动、只读收据与退出](../portable-release/README.md)、[邮件占用处置](../../database/chapter-45/README.md)、[清理任务单笔运行](../maintenance/README.md)都沿用原来的入口。正文 75.4 在验证新配置后禁止旧登录并观察仍活着的旧会话。留存原角色作为权限来源，撤销其登录与删除角色产生不同结果。


容器部署沿用[第 76 章系统级目录](../container-deployment/cleanup.md) `/opt/epp-container` 与 `compose.env`。新 API、邮件、通知、清理登录须分别加入实际数据库对 `172.28.74.0/24` 的精确 HBA 许可；先核对新连接，再撤旧入口。容器不会因宿主改 env 文件自动更换已建立连接，配置切换用明确项目目录的 Compose `up -d --force-recreate` 重建对应角色。邮件先停旧消费者、核对 unknown 后再接管，保持 `restart: "no"`。API 的 CURSOR_HMAC_KEY 在并行期间须按正文验证旧 Cookie、CSRF 与游标；同库并不意味着密钥相同。

清理 timer 的下一次运行读取 `secrets/cleanup.env`，无常驻容器也要更新它。保持 root:10001、0640；原子替换配置文件后重建长期容器，避免已绑定旧 inode 的容器继续读旧文件。只读收据 CLI 仍单独交付与授权，不能拿 API 镜像默认入口当成它。撤销旧登录之前，按本章活动连接查询逐个确认所有使用者，包括计时器、手动 CLI、另一台主机和旧容器。
