# 第 71 章　分角色部署的启动与交接说明

先按[服务身份与授权](../service-roles/README.md)升级原部署。示例中的路径、系统用户名和端口按实际部署填写，已有环境继续使用原名称。交付前先在原环境填好这张表中的实际值，原会话、口令和连接串保存在各自的私有客户端或配置文件里。这里的示例让 Debian 运行 Node，操作端经 SSH 到达 API。数据库和桶使用同一套练习副本。

| 交给运行者的项目 | 本章示例与检查方法 |
| --- | --- |
| 版本与产物 | 按第 65 章的方法为本章代码、操作系统、架构和 Node 24.22.1 验收的完整归档含 dist（含 dist/config/service.json）、package.json、package-lock.json、项目 .npmrc 和生产 node_modules。同平台从可信交接单取 SHA-256，核对归档再解开，直接运行。跨平台保留同一构建的 dist 和清单，在匹配目标平台的独立打包目录按锁 `npm ci --omit=dev`，连同生产依赖重新归档，记录对应平台和新摘要，另行验收 |
| 安装与身份 | 示例安装根 `/opt/epp72/release`，root 管理，运行账号只读。系统用户 epp-api、epp-mail、epp-notify、epp-receipt 分开；各自读取 `/etc/epp72` 下自己的一份 0640 配置。数据库继续用[第 71 章按角色核过的权限](../service-roles/README.md)，收据 CLI 用 epp-receipt 宿主身份和只读数据库登录 epp_receipt74 |
| 客户端入口 | 保留原来的来源和 Cookie。示例客户端访问 `http://127.0.0.1:13374`；部署端的 `LISTEN_HOST=::1`、`PORT=3374`。转发到目标的 IPv6 回环，APP_ORIGIN 填客户端所见的来源 |
| 依赖 | 每份 DATABASE_URL 从该进程可达。API 保留原 CURSOR_HMAC_KEY、配对桶的 AVATAR_S3 配置；签名 URL 的主机与端口还须从浏览器可达。邮件的 LOCAL_SMTP_HOST、LOCAL_SMTP_PORT 指向独立练习收件端，通知无需 SMTP |
| 可写数据 | API 在独立私有 work 下创建 .avatar-tmp，目录归当前运行用户，0700。Worker 和收据 CLI 可从只读 release 运行。数据库、对象、各角色秘密和通道事实应能跨进程替换保留；按宿主策略收集标准输出与标准错误 |
| 停止与启动 | 前台 Node 接收 SIGTERM；本章宿主给 40 秒收尾。API 默认排空期限 5 秒，Worker 在停止领取后等当前任务收尾，设有 10 秒期限。邮件出现 unknown、paused 或 lost-after-send 时退出 2；先按事故 ID 核对，恢复过程由值班者决定。先停旧的自动拉起 |

用与目标匹配的归档实际启动 API、两个 Worker 和收据 CLI，做一次真实图片解码并核对旧收据。保留平台、归档摘要及验收记录，交付时使用这一份已验归档。

### 四个前台入口

下表的相对路径均从 release 起算，部署端 Node 为 `/opt/epp72/node/bin/node`。由启动者设置工作目录和环境，再用同一份 Node 运行。直接注入环境时，命令为 `node 脚本 [实参]`；使用受限配置文件时，把 `--env-file=/绝对路径/角色.env` 放在脚本前。收据 CLI 的三个变量来自独立的交接记录，账号 UUID 在前，操作 UUID 在后。

| 角色 | 工作目录 | 脚本与实参 | 接手证据 |
| --- | --- | --- | --- |
| API | `/var/lib/epp72-api` | `/opt/epp72/release/dist/src/server.js` | 原会话请求 20；26 签发后实际读原图；用旧写令牌发 24 |
| 邮件 | release | `dist/src/mail-worker.js "$db"` | 先查通道与积压。通道开放且收端已核对时，在练习箱核对一笔投递；已有占用时保留原消息及尝试次数 |
| 通知 | release | `dist/src/mail-worker.js "$db" notifications` | 核对本轮任务 ID 的 done 与收件箱同 ID 记录 |
| 账号收据 | release | `dist/src/account-admin.js "$db" receipt "$user_id" "$operation_id"` | 比对原操作 ID、requestedEnabled、recordedAt 和原执行者 dbActor；成功后自行退出 |

迁移与备份仍由相应管理员在独立环境执行。

### 在同一端口交接

1. 切换前用 05 登录、20 核对 userId、15 留住会话写令牌，26 取得头像后实际 GET 并记下 ID、长度与内容摘要。用同一份只读身份分别在切换前后查询同一张收据。记下邮件通道 paused_by 及对应消息的状态、次数，另选通知任务作为对照。
2. 若要制造邮件停发，只在原通道开放、旧消费者停妥的隔离副本演练。先在正常练习箱接收一封，保留确认令牌；停妥收件端，换成[断开最终应答的练习 SMTP](../../database/chapter-45/smtp-lab.mjs)，用另一个地址申请。等通道指向第二个消息且该消息已是 unknown，再确认第一封，留下可独立处理的通知。
3. 停原 API，保留客户端入口，在操作端另开 SSH 转发。例如 `ssh -N -o ExitOnForwardFailure=yes -L '127.0.0.1:13374:[::1]:3374' epp-lab`。新 API 就绪后用同一客户端发 20、24、26。24 若获 403，先查 Origin 与错误码；若为 500，查实际进程 cwd、属主与写权限，改好工作目录再试。26 返回的签名地址按原样打开。
4. 用[分块客户端](../avatar-preview/upload.mjs)在单独会话持有 32 字节预览，在期限内向新 API 发 TERM。核对客户端 503 SERVICE_DRAINING、本次 input 消失、app.stopped 和监听释放。重启后回到原客户端复查资料、头像和原收据。按同一消息 ID 交接邮件占用；单独确认通知处理资格后启动通知并回查入箱。交班时填写实际的值、未处理的 ID 与接下来允许启动的角色。

镜像可把上述前台命令按参数数组交给 Node，把运行 UID、work、依赖地址、秘密与停止宽限期映射到平台。练习中的 Linux 账号名、SSH 转发和 systemd 单元只用于提供这些条件。
