# 第 73 章：Compose 接管三个应用进程

这一阶段保留第 71 章的宿主 nginx、PostgreSQL、SeaweedFS、Mailpit 和已有业务数据，只将 API、邮件与通知进程改由 Compose 托管。镜像来自第 72 章。它不会替你迁移库、创建桶、重置账号或修复 unknown 邮件。在维护窗口记录并停止旧消费者，接通依赖后启动新角色，最后从原 HTTPS 地址验收。

## 1. 在 Linux 部署主机上建空交付目录

确认 `hostname`、`uname -s`、`docker context show`、`docker info` 与 `docker compose version` 指向预期 Linux 主机。下面的源目录是该主机已经取得的本章配套；部署目录可从空目录开始：

```sh
# 换成本章源码在部署主机上的绝对路径。
EPP_SOURCE=/absolute/path/to/epp-book-code
EPP_DEPLOY=/opt/epp74
sudo install -d -m 0755 "$EPP_DEPLOY"
sudo install -m 0644 "$EPP_SOURCE/examples/container-deployment/compose.yaml" "$EPP_DEPLOY/compose.yaml"
sudo install -m 0644 "$EPP_SOURCE/examples/container-deployment/compose.env.example" "$EPP_DEPLOY/compose.env.example"
sudo install -m 0644 "$EPP_SOURCE/examples/container-deployment/compose.md" "$EPP_DEPLOY/compose.md"
sudo install -d -m 0700 "$EPP_DEPLOY/secrets"
sudo install -d -m 0755 "$EPP_DEPLOY/trust"
# 仅首次创建；已有 compose.env 要先阅读，不能覆盖现场镜像与库名。
test ! -e "$EPP_DEPLOY/compose.env"
sudo install -m 0600 "$EPP_DEPLOY/compose.env.example" "$EPP_DEPLOY/compose.env"
sudoedit "$EPP_DEPLOY/compose.env"
```

把 `EPP_IMAGE` 改为第 72 章实际通过检查的 `docker image inspect --format '{{.Id}}' epp:chapter-73` 结果，`EPP_DATABASE` 改为现有库名。不要把模板占位字当成镜像或数据库。镜像必须已在当前引擎上存在；其他主机上的本地 image ID 并不代表这里已取得镜像。`compose.env` 只供 Compose 替换镜像和命令参数，不会自动变成 Node 的运行环境。

后续统一用下列函数，避免 SSH 新开终端后工作目录不同导致误读另一份文件；新终端先重新定义：

```sh
EPP_DEPLOY=/opt/epp74
epp_compose() {
  sudo docker compose --project-directory "$EPP_DEPLOY" \
    --env-file "$EPP_DEPLOY/compose.env" -f "$EPP_DEPLOY/compose.yaml" "$@"
}
```

`./secrets/api.env` 和 `./trust/root.crt` 等绑定源相对于 Compose 项目目录解析；默认是首份 Compose 文件所在目录，本例再用 `--project-directory` 显式固定。`--env-file` 则用绝对路径。`bind.create_host_path: false` 让缺文件立即报错，避免 Docker 悄悄创建同名目录。

## 2. 先为原生依赖建立私网通路

读取宿主路由和所有现存 Docker 网络，确认 `172.28.74.0/24` 不与宿主 LAN、VPN、VM 或其他容器网段重叠：

```sh
ip route
docker network ls
docker network inspect $(docker network ls -q)
docker network create --driver bridge --subnet 172.28.74.0/24 \
  --gateway 172.28.74.1 epp74-backend
docker network inspect epp74-backend --format '{{json .IPAM.Config}}'
```

若名称已经存在，先检查它的驱动、子网和网关，符合才复用，不删除别人的网络。若此网段冲突，选择未占用网段，并同步改 Compose 的三个 `extra_hosts`、下面的监听/HBA/防火墙与实际代理 IP。网络为 external，Compose 不替你创建或删除它。

涉及数据库重启前，先记录并停止旧消费者，保存这些输出供最后回退：

```sh
systemctl is-enabled epp72-api epp72-mail epp72-notify
sudo systemctl stop epp72-api epp72-mail epp72-notify
systemctl show epp72-api epp72-mail epp72-notify -p ActiveState -p MainPID -p ExecMainStatus
```

is-enabled 显示 disabled 可以正常；三个角色应 inactive、MainPID=0。有异常退出或在途邮件时先按原 ID 核对，不把停机当作外部投递撤销。

容器里的回环是自己。`epp-data.internal` 在容器中固定指向宿主网桥网关 `172.28.74.1`；Compose 不会因此自动改变宿主原有监听。必须逐一完成以下改动：

- **PostgreSQL**：用现有管理员连接执行 `SHOW config_file; SHOW hba_file; SHOW port; SHOW listen_addresses;`，确认本轮库和真实端口。把 `listen_addresses` 从原回环扩为原回环加 `172.28.74.1`，例如 `127.0.0.1,::1,172.28.74.1`；监听变更要安排数据库重启，须先停止应用消费者并沿用前章停机规程。保留原回环入口。HBA 仅新增本轮数据库与 `epp_api,epp_mail,epp_notify` 三个角色来自 `172.28.74.0/24` 的 SCRAM 条目，置于会匹配它的拒绝规则之前。不要加 `host all all 0.0.0.0/0 trust`。例如库名为 `epp_handoff` 时：`host epp_handoff epp_api,epp_mail,epp_notify 172.28.74.0/24 scram-sha-256`。用真实库名替换示例，再按既有管理员连接执行 `SELECT pg_reload_conf();`；HBA 重载不能替代监听变更所需的重启。
- **Mailpit**：先核对现有 epp-inbox 的路径和持久文件，然后 `sudo systemctl edit epp-inbox`，在 `[Service]` 中用空 `ExecStart=` 清除旧命令，再设 `ExecStart=/opt/epp-data/bin/mailpit --smtp 172.28.74.1:1025 --listen 127.0.0.1:8025 --database /var/lib/epp-inbox/mail.db`。路径换成前章真实值，保留原邮件数据库和回环网页入口。执行 daemon-reload、restart epp-inbox，再用 `ss -lnt` 确认 SMTP 只在网关、网页仍在回环；本轮不配置上游投递或 relay。原生邮件配置保留用于回退，原消费者继续停用。
- **对象 HTTPS**：SeaweedFS 后端继续监听原回环并使用原桶。第 71 章对象入口为 `https://api.epp.test:9443`，nginx 的 9443 server 原先只监听部署机 LAN 地址，并以 allow/deny 限定 LAN。容器增加名称映射不能改变监听与访问控制。编辑原 `nginx-private.conf` 的 **9443 对象 server**：保留原 listen，新增 `listen 172.28.74.1:9443 ssl;`，并在 `deny all;` **之前**新增 `allow 172.28.74.0/24;`。8443 页面 server 不需要增加网桥监听。证书名称、完整链、Host、路径和查询参数保持不变；Compose 将 `api.epp.test` 映射到网关。API 和浏览器仍使用同一个 HTTPS endpoint，不能换成内部 HTTP 地址。
- **宿主防火墙**：仅允许本桥接接口、源网段 `172.28.74.0/24` 到网关上的实际 PostgreSQL、SMTP、对象 HTTPS 端口，保留既有回环和管理规则，拒绝其他来源使用新数据入口。用本机已经管理防火墙的工具修改并复查，不照搬另一台机器的表/链名称，也不要清空现有规则。Docker `ports` 只发布 API 回环端口，不能代替宿主数据服务自己的访问规则。

新增网关监听还依赖开机时先恢复 Docker 外部网络。对本章实际单元 `postgresql@18-epp`、`epp-inbox` 和 `epp74-https`，分别执行 `sudo systemctl edit 单元名`，在保留已有覆盖项的同时追加：

```ini
[Unit]
Wants=docker.service
After=docker.service
```

随后 `sudo systemctl daemon-reload`。Wants 请求启动引擎，After 安排启动顺序，并不能证明网关已存在或数据库已能服务。重启部署主机后仍要用 `docker network inspect epp74-backend`、`ip address`、`ss -lnt` 核对网关、PG、SMTP 和对象入口，并实际连接；不能只看 unit 为 active。PostgreSQL 可能只成功绑定配置列表中的一部分地址，所以必须确认回环和 `172.28.74.1` 的实际监听都存在。

nginx 不使用系统默认配置，而是第 71 章独立前缀。恢复当时实际前缀，例如原部署账号的 `edge="$HOME/epp75-edge"`，并用 `systemctl show epp74-https -p WorkingDirectory` 核对，再执行：

```sh
/usr/sbin/nginx -t -p "$edge/" -c nginx-private.conf
sudo systemctl reload epp74-https
ss -lnt 'sport = :9443'
```

两个 9443 地址都应监听。若只有 LAN 地址会连接拒绝；若新地址已经监听但 allow 放在 deny 后，则容器会收到 nginx HTML 403，而不是 S3 的 XML 鉴权错误。

记录这些变更和回退值。这是本章从原生托管演进到 bridge 容器所增加的真实边界：数据没有搬走，但应用连接的来源、目标地址和授权入口变了。专用 bridge 不是能抵御宿主管理员的独立安全边界；宿主有 Docker 管理权者仍可以接入网络。

## 3. 准备三份真正独立的运行配置

从第 71 章原有配置复制到部署目录，再修改每份数据库连接的**主机**为 `epp-data.internal`、**端口**为上节实查端口，保留各自库角色、密码、库名及原签名密钥。下面的源路径须换成前章实际路径；不能从环境模板假造已有账号：

```sh
sudo install -o root -g 10001 -m 0640 /etc/epp72/api.env "$EPP_DEPLOY/secrets/api.env"
sudo install -o root -g 10001 -m 0640 /etc/epp72/mail.env "$EPP_DEPLOY/secrets/mail.env"
sudo install -o root -g 10001 -m 0640 /etc/epp72/notify.env "$EPP_DEPLOY/secrets/notify.env"
# 复制公开根证书，路径换成第 72 章的真实公开根；绝不复制 CA 私钥。
sudo install -o root -g root -m 0644 /absolute/path/to/public-root.crt "$EPP_DEPLOY/trust/root.crt"
sudoedit "$EPP_DEPLOY/secrets/api.env" "$EPP_DEPLOY/secrets/mail.env" "$EPP_DEPLOY/secrets/notify.env"
```

首次复制前确认目标不存在；已有部署的文件须先备份并编辑，不能直接覆盖。`secrets` 目录为 root 的 `0700`，文件为 `root:10001`、`0640`。Docker 挂载单个文件后运行 GID 10001 可读；其他角色只获得自己那个挂载，而不是整个目录。采用普通绑定文件，不能假设 Compose secrets 的 `uid`/`mode` 会替宿主文件修改权限。

三份内容按下表核对，不要输出实际凭据：

| 文件 | 必需内容与本轮调整 |
| --- | --- |
| `api.env` | 原 epp_api 的 DATABASE_URL、DB_POOL_MAX、原 CURSOR_HMAC_KEY、原 HTTPS APP_ORIGIN、四个 AVATAR_S3_*、日志与停止预算；S3 endpoint 保持 `https://api.epp.test:9443`，两侧都能访问这个名称与端口。建议 `SHUTDOWN_TIMEOUT_MS=20000`。 |
| `mail.env` | 原 epp_mail 的 DATABASE_URL、日志；`LOCAL_SMTP_HOST=epp-data.internal`，`LOCAL_SMTP_PORT` 为实际 SMTP 端口。 |
| `notify.env` | 原 epp_notify 的 DATABASE_URL 和日志，不挂 API 密钥或 SMTP 配置。 |

Compose 的 API `environment` 显式固定 `NODE_ENV=production`、`LISTEN_HOST=0.0.0.0`、`PORT=3000`、公开 CA 路径和已确认的可信代理 IP。它们优先于 Node `--env-file` 的同名值。原 `api.env` 里曾用的 `::1:3374` 因此不能让容器继续只监听自身回环。保持 `APP_ORIGIN` 是客户端实际看见的 HTTPS 来源，不能改成 `http://api:3000`。

API 读公开 CA 的设置在进程启动前注入。所有角色仍直接运行 Node；镜像 ENTRYPOINT 已是 `node --enable-source-maps`，所以 `command` 只有 Node 选项、脚本与参数。邮件命令最后是期望库名；通知再加 `notifications`。运行身份从原三个宿主账号变成各容器内的 10001，但数据库身份和配置挂载仍分开。

## 4. 先检查，再切换消费者与入口

```sh
epp_compose config --quiet
epp_compose config --images
# run 覆盖应用 command，先读文件，不启动业务消费者。
epp_compose run --rm --no-deps api --input-type=module -e '
import { access } from "node:fs/promises";
await access("/run/epp/api.env"); await access("/run/epp/root.crt");
console.log("API UID",process.getuid(),"can read its config and public CA");'
epp_compose run --rm --no-deps mail --input-type=module -e '
import { access } from "node:fs/promises";
await access("/run/epp/mail.env");
try { await access("/run/epp/api.env"); process.exitCode=1; }
catch { console.log("mail config readable; API config is absent"); }'
epp_compose run --rm --no-deps notify --input-type=module -e '
import { access } from "node:fs/promises";
await access("/run/epp/notify.env"); console.log("notify config readable");'
```

再用同一镜像、同一配置和同一网络实测 DB 身份与 TCP 通路。API 示例只打印数据库、角色与地址，不打印密码：

```sh
epp_compose run --rm --no-deps api --env-file=/run/epp/api.env --input-type=module -e '
import { createRequire } from "node:module";
const { Client } = createRequire("/opt/epp/package.json")("pg");
const u=new URL(process.env.DATABASE_URL); u.search="";
const c=new Client({connectionString:u.toString(),connectionTimeoutMillis:3000});
try { await c.connect(); console.log((await c.query("SELECT current_database(), session_user, inet_client_addr(), inet_server_addr()")).rows[0]); }
finally { await c.end(); }'
```

将服务名和 `--env-file` 路径分别换成 mail、notify 后重复，三者必须进入同一预期库但使用各自角色。再以应用身份验证 API 能读原收据、头像存储写读，以及邮件通道指向本轮 Mailpit；TCP 可连不等于授权正确或投递结果已确定。

接管前先记录 `systemctl is-enabled epp72-api epp72-mail epp72-notify` 的结果，再停妥三个旧消费者。第 71 章 HTTPS unit 的 Wants/After 仍关联原 API：编辑 `/etc/systemd/system/epp74-https.service`，**只从 Wants 和 After 移除 `epp72-api.service`，保留包括 Docker 在内的其他依赖**。否则以后重启 HTTPS 入口会重新拉起旧 API，造成端口争用或双消费者。执行：

```sh
sudo systemctl disable epp72-api epp72-mail epp72-notify
sudo systemctl daemon-reload
systemctl show epp72-api epp72-mail epp72-notify -p ActiveState -p MainPID -p ExecMainStatus
```

三个旧角色必须 inactive、MainPID=0，原 API 不再占用宿主 3374；有在途邮件或异常退出时先核对原 ID。disable 只防开机恢复，不能代替前面的 stop。保存旧启用状态和 unit 依赖供回退。已有 pending/unknown 按原 ID 核对，不清空任务。然后先启动 API 和通知：

```sh
epp_compose up -d api notify
epp_compose ps --all
epp_compose logs --tail 30 api notify
curl -i http://127.0.0.1:3374/profile/me
```

应看到匿名 `401 AUTH_REQUIRED`。healthcheck 也只检查这个结果；它不是数据库、对象存储和业务就绪检查，变成 unhealthy 本身也不会触发 Docker 重启。

宿主 nginx 原 API 的 upstream 改为 `http://127.0.0.1:3374`，保留原 HTTPS 名称、证书、同源静态页面与 3m 请求体上限，用前述独立前缀执行 `/usr/sbin/nginx -t -p "$edge/" -c nginx-private.conf` 通过后，再 `sudo systemctl reload epp74-https`。容器只把 API 发布在宿主回环，不向 LAN 直接发布 3000。若使用真实客户端 IP，代理必须覆盖客户端传入的转发头，例如 `proxy_set_header X-Forwarded-For $remote_addr;`、`proxy_set_header X-Forwarded-Proto $scheme;` 和清空 `Forwarded`，不能把不受信任的链原样转交。

`EPP_TRUST_PROXY_IP` 必须是 API **实际收到连接的直接对端**，而不是根据代理名称猜测。此桥接方案预期为 `172.28.74.1`；启动前可先用该值做受限回环对照，但正式交付前必须观察验证。可在宿主保持一条到发布端口的连接，在另一终端读取容器自身的 Linux socket 表：

```sh
# 宿主终端一：使用前章已安装的 Node；30 秒后自动关闭这条连接。
node -e 'const s=require("node:net").connect(3374,"127.0.0.1"); s.on("connect",()=>console.log("connection held for inspection")); setTimeout(()=>s.end(),30000);'
# 终端二：重新定义 epp_compose 后执行；只显示到容器3000的已建立IPv4连接。
epp_compose exec -T api node --input-type=module -e '
import { readFileSync } from "node:fs";
for(const line of readFileSync("/proc/net/tcp","utf8").trim().split("\n").slice(1)) {
  const f=line.trim().split(/\s+/);
  if(f[1].endsWith(":0BB8") && f[3]==="01") {
    const h=f[2].split(":")[0];
    console.log("direct peer:",h.match(/../g).reverse().map(x=>parseInt(x,16)).join("."));
  }
}'
```

这个观察核对宿主到同一发布端口的连接路径；同时核对 nginx 的 upstream 确实使用该端口。若实际部署改用不同路径或代理容器，重新观察，更新 `compose.env` 后 `epp_compose up -d api` 使配置生效。不能将 Docker 网段 CIDR 或服务名填入应用只接受精确 IP 的 `TRUST_PROXY_IPS`。

确认旧发送者已停止、Mailpit 是本轮练习收件箱、unknown 处置边界清楚后才启动邮件：

```sh
epp_compose up -d mail
epp_compose ps --all
epp_compose logs --tail 30 mail
```

`mail` 的 `restart: "no"` 有意保留退出 2，避免 unknown/paused/lost-after-send 自动反复重启。Compose 无法直接表达 systemd 的 `RestartPreventExitStatus=2`。API/通知采用 unless-stopped；它们因配置错误反复退出时先停止排查，不靠循环重启掩盖问题。重启宿主后邮件也须人工核对再启动，不能称这套配置会自动恢复所有角色。

## 5. 用既有结果验收，并练习重建

从原同源 HTTPS 页面用旧账号和旧 Cookie 读取本人资料、素材与原头像，比较原收据和头像摘要；再上传 PNG/JPEG、预览、发布并在浏览器解码。申请一次注册或改密，在原 Mailpit 收到预期消息，完成确认，按任务 ID 对照通知完成和收件箱同 ID 行。不能用新空库或假账号代替这些既有结果。

Compose 只对三个应用进程设置初始练习预算：API 1 GiB、1 CPU、128 PID；两个 Worker 各 256 MiB、0.5 CPU、64 PID。它们不是经过容量测试的上线承诺；保留宿主数据库、存储和 nginx 的余量，结合本章实际负载调整。16 MiB `/work` tmpfs 是私有头像暂存，不能放持久数据。stdout/stderr 用 json-file 每文件 10 MiB、三份轮转；旧容器删除后日志也可能丢失，重要验收记录须另存。

外层停止预算 40 秒，大于 API 最大 30 秒和 Worker 内部 10 秒。先用原上传实验保持在途请求再执行 `epp_compose stop api`，核对排空、退出码和原数据。然后重建 API：

```sh
epp_compose up -d --force-recreate api
epp_compose ps --all
epp_compose logs --tail 30 api
docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}}' "$(epp_compose ps -a -q api)"
```

再次读取同一素材、头像和收据。容器可重建而数据保持，是因为数据仍由原宿主服务持有；不能据此宣称已验证数据库容器卷或备份恢复。`down` 只移除本项目应用容器，external 网络和原生数据仍在；先停止并记录角色结果再清理。停止/重建容器不会撤销已经到达 Mailpit 的邮件。

需要回退时，先停本轮三个容器，确认端口与消费者已释放，再恢复原 nginx upstream、转发头与原 API unit 依赖，撤回本轮 epp-inbox SMTP 覆盖并重启至原回环；按保存记录恢复原生应用配置、启用状态和托管，再用相同库、桶、签名密钥和原 HTTPS 来源复验。PG 保留回环，可以先恢复应用，再安排维护窗口收回本轮网关监听、HBA 与已不需要的 Docker 启动顺序覆盖。不把回退程序等同于恢复数据库到过去。不要在原生邮件与新邮件容器之间制造重复消费者。

参考：[Compose 服务、环境优先级与重启策略](https://docs.docker.com/reference/compose-file/services/)、[Docker bridge 网络](https://docs.docker.com/engine/network/drivers/bridge/)。本配套未把网络或业务实跑结果预写为通过；以当前主机的实际命令输出和验收记录为准。
