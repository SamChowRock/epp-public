# 第 75 章：让宿主调度一次性维护容器

先完成[原生维护练习](../maintenance/README.md)的角色、列授权和单笔资格核对，保留同一非空库、桶、当前头像与到期样本。容器方式复用原清理语义；它不会创建清理身份或授予数据库、S3 权限。本章 Dockerfile 增加 `database/chapter-51/clean.mjs` 与 `scripts/verify-database.mjs`，必须重新构建和验收本章镜像，不能继续把第 72 章镜像 ID 当成已包含清理工具的制品。

## 交付到系统级目录

第 73 章的部署目录是 `/opt/epp74`，系统计时器从本章统一使用 root 管理的 `/opt/epp-container`。在 Linux 部署主机创建这个全新目录并复制现有真实配置；下面的源码路径换成本章实际检出：

```sh
EPP_SOURCE=/absolute/path/to/epp-book-code
EPP_OLD=/opt/epp74
EPP_DEPLOY=/opt/epp-container
test ! -e "$EPP_DEPLOY"
sudo install -d -m 0755 "$EPP_DEPLOY" "$EPP_DEPLOY/trust"
sudo install -d -m 0700 "$EPP_DEPLOY/secrets"
sudo install -m 0644 "$EPP_SOURCE/examples/container-deployment/compose.yaml" "$EPP_DEPLOY/compose.yaml"
sudo install -m 0600 "$EPP_OLD/compose.env" "$EPP_DEPLOY/compose.env"
for role in api mail notify; do
  sudo install -o root -g 10001 -m 0640 "$EPP_OLD/secrets/$role.env" "$EPP_DEPLOY/secrets/$role.env"
done
sudo install -m 0644 "$EPP_OLD/trust/root.crt" "$EPP_DEPLOY/trust/root.crt"
sudo install -o root -g 10001 -m 0640 /etc/epp73/cleanup.env "$EPP_DEPLOY/secrets/cleanup.env"
sudoedit "$EPP_DEPLOY/compose.env" "$EPP_DEPLOY/secrets/cleanup.env"
```

最后一份源配置来自本章原生练习；如果原生路径不同，换成实际文件。保留专用 `epp_cleanup` 数据库身份和专用 S3 删除身份，将数据库主机改为 `epp-data.internal`、端口保持真实端口。将 S3 endpoint 改为容器与使用端都能访问的原 HTTPS 地址；公开 CA 仍挂到 `/run/epp/root.crt`。不要把 API 密钥复制给清理角色。

按第 73 章已限定的数据库/HBA与防火墙规则，追加本库的 `epp_cleanup` 登录来自 `172.28.74.0/24` 的 SCRAM 许可，再重载 HBA并实查连接角色。原 HBA 如果只列 API、邮件、通知三个身份，清理程序仍会被拒绝；创建角色本身不会打开这个通路。

在 `compose.env` 更新 `EPP_IMAGE` 为本章镜像的实际不可变 ID，并**从交接单独立抄写** `EPP_S3_ENDPOINT` 与 `EPP_S3_BUCKET`，保留 `EPP_DATABASE`。这三个参数是命令的预期目标，与 `cleanup.env` 的有效配置比较，不能直接从后者读取再声称完成独立核对。`compose.yaml` 即使只启动 API，也会先检查这些 `${变量:?}`；升级本章定义时必须一起补齐。

项目名称仍是 `epp74`，不是另起一套重复消费者。确认新目录中的 API、邮件和通知配置与旧交接相同；切换后统一从新目录管理，禁止两个目录交替重建同名项目。旧目录仅保留回退记录。

## 先手动核对，不启动日历

```sh
dc() {
  sudo docker compose --project-directory /opt/epp-container \
    --env-file /opt/epp-container/compose.env -f /opt/epp-container/compose.yaml "$@"
}
dc config --quiet
sudo docker context show
dc run --rm --no-deps cleanup --input-type=module -e '
import { access } from "node:fs/promises";
await access("/opt/epp/database/chapter-51/clean.mjs");
await access("/opt/epp/scripts/verify-database.mjs");
await access("/run/epp/cleanup.env"); await access("/run/epp/root.crt");
console.log("cleanup entry, helper, config and CA readable by UID",process.getuid());'
```

Compose 的 `cleanup` 有 `profiles: [maintenance]`，普通 `up -d` 不自动启动删除。显式 `run cleanup` 会启用该服务。镜像 ENTRYPOINT 已包含 Node，命令覆盖只给参数，不能再加一个 `node`。

先按本章只读 SQL 记录当前头像 ID 和本轮到期 ID。指定单笔的练习需要用实际交接值替换下列三个占位参数及 UUID：

```sh
dc run --rm --no-deps cleanup --env-file=/run/epp/cleanup.env \
  /opt/epp/database/chapter-51/clean.mjs \
  EXPECTED_DATABASE EXPECTED_HTTPS_ENDPOINT EXPECTED_BUCKET CURRENT_AVATAR_UUID
```

当前头像应取零并保持实读；把最后参数换成本轮确认到期的 UUID，应只处置该笔。核对日志和真实对象，再决定运行默认批次 `dc run --rm --no-deps cleanup`。无额外 ID 时最多处理 20 项；退出 0、删除计数 0 都不能单独证明此前失败对象已经消失。

## 安装宿主 timer

先停旧 `epp-avatar-clean.timer`，等其 service 执行结束；核对没有其他主机或手动调度。确认 `command -v docker` 是 `/usr/bin/docker`，否则修改配套 service 的绝对路径。Docker 管理权限用于启动容器，不能因此给原宿主 `epp-cleanup` 用户 Docker 组权限。

```sh
sudo install -m 0644 "$EPP_SOURCE/examples/container-deployment/epp-container-clean.service" /etc/systemd/system/epp-container-clean.service
sudo install -m 0644 "$EPP_SOURCE/examples/container-deployment/epp-container-clean.timer" /etc/systemd/system/epp-container-clean.timer
sudo systemd-analyze verify /etc/systemd/system/epp-container-clean.service /etc/systemd/system/epp-container-clean.timer
sudo systemctl daemon-reload
sudo systemctl start epp-container-clean.service
systemctl show epp-container-clean.service -p Result -p ExecMainStatus
sudo journalctl -u epp-container-clean.service --since '10 minutes ago' --no-pager
```

一次性 service 前台等 Compose 返回，stdout/stderr进入 journal；`--rm` 删除执行后的容器，保留数据库和对象事实。`TimeoutStartSec=infinity` 有意不从宿主启动超时杀掉 Compose 客户端；异常拖长时先调查引擎中的实际容器和数据库工作，再定向停止，不能立刻补跑第二轮。

确认本轮真实镜像、汇总、原到期 ID 与当前头像后，再 `sudo systemctl enable --now epp-container-clean.timer`，查看 NEXT；禁用旧 `epp-avatar-clean.timer` 的开机恢复。同一 oneshot 的日历触发不会重复并发启动，但另一台主机、另一个 timer 和手动运行仍可能重叠。数据库领取和重复删除规则仍负责一致性。最后重做一次对象端点断开与恢复，沿同一个失败 ID 验收，保留日志和旧收据。
