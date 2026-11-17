# 第 72 章：把原生交付物装进 Linux 镜像

从第 71 章已交付的原生 API、邮件、通知、非空 PostgreSQL 库、对象桶和 HTTPS 入口继续。容器解决的是运行时与依赖的交付：原生服务仍可使用，数据库身份、业务记录和客户端地址不会因为构建镜像而自动迁移。本章先得到可检查的镜像；第 73 章再接 Compose、网络、配置与持久数据。

本目录增加部署材料，不改应用或迁移。构建与检查命令在已安装 Docker Engine 和 Compose 插件的 Linux 部署主机执行；Mac 操作端通过 SSH 登录该主机。先执行 `hostname`、`uname -s`、`docker context show`、`docker info` 和 `docker compose version`，确认操作的是预期 Linux 引擎。Mac 的项目目录不会自动成为远端构建上下文，须先把本分支源码交付到部署主机。Docker 管理权限可以控制宿主，不能把它当成普通应用账户权限。

## 1. 源码、平台与构建输入

在配套仓库根目录运行：

```sh
git status --short
git rev-parse HEAD
docker version
docker buildx imagetools inspect node:24.22.1-bookworm-slim
```

记录源码提交、目标 `linux/arm64` 或 `linux/amd64`、基础镜像清单摘要。最后一条必须成功且包含目标架构；失败时先解决网络、镜像取得或版本供应，不能静默改为 `latest`。书中应用锁定 Node **24.22.1**，`.npmrc` 开启严格引擎检查，Dockerfile 也核对实际 Node 版本。默认标签便于首次构建；实际交接应将刚查到的真实摘要写入 `NODE_IMAGE`：

```sh
# 把下面的 sha256:REPLACE_WITH_VERIFIED_DIGEST 换成刚查到的真实清单摘要。
NODE_IMAGE='node:24.22.1-bookworm-slim@sha256:REPLACE_WITH_VERIFIED_DIGEST'
docker build --pull --build-arg "NODE_IMAGE=$NODE_IMAGE" -t epp:chapter-73 .
docker image inspect epp:chapter-73 --format '{{.Id}} {{.Os}}/{{.Architecture}}'
docker run --rm epp:chapter-73 --version
```

最后应输出 `v24.22.1`。镜像入口已经是 `node --enable-source-maps`，因此不要写成 `docker run … node --version`；那会把 `node` 当成脚本文件。命令中的标签只是可移动的本地名字；记录 image ID 才能说明本机检查的是哪份镜像。尚未推送的本地镜像可能没有 RepoDigest；基础镜像摘要、应用 image ID、仓库 RepoDigest 和导出包 SHA-256 是不同对象，不能互相代替。

Dockerfile 有四个阶段：

1. `base` 固定 Node 和 Debian 基础，安装公开 CA 信任包。
2. `build` 安装原生模块可能需要的编译工具，`npm ci` 按锁安装，再执行 `npm run build`。它的 `prebuild` 离线生成 `src/generated/prisma`，TypeScript 将其编译进 `dist`；构建脚本另把 `config/service.json` 复制到 `dist/config/service.json`。整个过程不需要 DATABASE_URL 或数据库访问。
3. `production-deps` 从已构建阶段执行 `npm prune --omit=dev`，按 npm 解析出的生产依赖树整理安装目录。包写在顶层 `devDependencies` 不代表它只具有开发用途：`@prisma/client` 7.10.1 同时通过 optional peer 关系关联 Prisma CLI 与 TypeScript，本项目实测 prune 后它们仍保留，不能据此声称镜像不含这些工具，也不要手工删包破坏已解析的依赖树。不要追加 `--omit=optional`：sharp 的平台原生包属于需要保留的 optional 依赖。交付验证关注生成客户端可导入、Argon2 和 sharp 能实际运算，以及构建阶段的系统编译器没有进入最终镜像。
4. `runtime` 只取得生产依赖、完整 `dist` 和声明 ESM 的 `package.json`，不复制构建阶段安装的系统编译器、迁移管理员口令或原始源码目录。node_modules 仍以 npm 解析的生产依赖树为准。镜像内文件由 root 拥有，应用使用 UID/GID `10001:10001`，工作目录是 `/work`。

`.dockerignore` 采用输入白名单：开发机的 `node_modules`、`dist`、旧生成客户端、`.git`、`.env*`、私钥、备份与本地工具不会随项目根目录进入上下文。源代码目录仍须保持没有秘密文件。不要把凭据放进 `ARG`、`ENV` 或 `COPY`。argon2 和 sharp 要在目标 Linux 镜像里安装；Mac 的依赖目录不能搬进来。如果目标架构与构建机不同，还需要已配置的跨平台构建能力，实际交接仍须在目标架构验收。

## 2. 在不接数据库的情况下检查镜像

下面实际调用两个原生模块，并核对生成客户端和配置文件；只打印结果，不打印配置或凭据：

```sh
docker run --rm --read-only --network none \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /work:rw,nosuid,nodev,noexec,size=16m,uid=10001,gid=10001,mode=0700 \
  epp:chapter-73 --input-type=module -e '
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { access, mkdir, stat } from "node:fs/promises";
const require = createRequire("/opt/epp/package.json");
const argon2 = require("argon2");
const sharp = require("sharp");
assert.equal(process.versions.node, "24.22.1");
assert.equal(process.getuid(), 10001);
await access("/opt/epp/dist/config/service.json");
const { PrismaClient } = await import("/opt/epp/dist/src/generated/prisma/client.js");
assert.equal(typeof PrismaClient, "function");
const hash = await argon2.hash("image-smoke-only", { memoryCost: 8192, timeCost: 1, parallelism: 1 });
assert.equal(await argon2.verify(hash, "image-smoke-only"), true);
const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#268" } })
  .resize(256, 256).webp().toBuffer();
assert.equal((await sharp(bytes).metadata()).width, 256);
await mkdir(".avatar-tmp", { mode: 0o700 });
const temp = await stat(".avatar-tmp");
assert.equal(temp.uid, 10001);
assert.equal(temp.mode & 0o777, 0o700);
await assert.rejects(access("/usr/bin/g++"));
console.log("Node, Prisma client, argon2, sharp and private work directory: OK");
'
```

这里的 Argon2 参数仅用于确认镜像内原生模块能计算，不是修改应用密码策略。这个检查没有启动 API、读取旧库或验证 HTTPS，也不能替代业务验收。

## 3. 从原生服务接入同一份 API

先准备容器确实能到达的数据库及 HTTPS 对象入口。容器里的 `127.0.0.1` 是它自己；原生数据库只监听宿主回环时，改写一个主机名并不能让它可达。第 73 章给出应用服务编排与已有数据通路。不要为了省略网络步骤直接公开数据库端口。

复制 [api.env.example](api.env.example) 到源码目录以外的私有配置目录，并填入第 71 章原有 API 库身份、库名、签名密钥、桶和应用存储凭据。保留客户端实际使用的 `APP_ORIGIN`。示例文件不是可以直接使用的真实配置。镜像不会自动加载宿主 `.env`；下面用 Node 的 `--env-file` 明确加载只读挂载文件。进程环境中同名变量优先于文件，避免再用 `-e DATABASE_URL=…` 等方式覆盖交接配置。

在 Linux 部署主机上让文件为 `root:10001`、`0640`，配置目录由管理员持有且为 `0700`。容器只挂载单个文件；先以实际 UID 验证文件可读，而不要把文件内容打印出来。公开根证书可为 `0644`，CA 私钥留在原签发端。Docker Desktop 的挂载权限映射可能不同，同样以容器内可读性为准。

```sh
EPP_CONFIG_DIR=/etc/epp-container
test -s "$EPP_CONFIG_DIR/api.env"
test -s "$EPP_CONFIG_DIR/root.crt"
docker run --rm --network none \
  --mount "type=bind,src=$EPP_CONFIG_DIR/api.env,dst=/run/epp/api.env,readonly" \
  --mount "type=bind,src=$EPP_CONFIG_DIR/root.crt,dst=/run/epp/root.crt,readonly" \
  epp:chapter-73 --input-type=module -e '
import { access } from "node:fs/promises";
await access("/run/epp/api.env"); await access("/run/epp/root.crt");
console.log("runtime UID can read both mounted files");'
```

运行命令用 `-e NODE_EXTRA_CA_CERTS=/run/epp/root.crt` 在 Node 启动前显式提供公开证书路径，让 Node 信任这份练习根；浏览器和操作端 curl 仍要各自完成第 71 章的信任准备。不得关闭 TLS 验证。S3 使用一个 `AVATAR_S3_ENDPOINT`，既供 API 上传也生成浏览器签名 URL，所以两侧必须能解析并访问同一个 HTTPS 名称和端口。`http://seaweed:8333` 不符合现有应用配置要求。反向代理须保留签名使用的 Host、路径和查询参数。

网络准备好以后可用下列入口启动 API；`epp74-backend` 是第 73 章准备的私有网络，而非 Docker 自带名称：

```sh
docker run -d --name epp73-api --network epp74-backend \
  --add-host api.epp.test:172.28.74.1 \
  --add-host epp-data.internal:172.28.74.1 \
  -e NODE_EXTRA_CA_CERTS=/run/epp/root.crt \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --stop-timeout 40 \
  --tmpfs /work:rw,nosuid,nodev,noexec,size=16m,uid=10001,gid=10001,mode=0700 \
  --mount "type=bind,src=$EPP_CONFIG_DIR/api.env,dst=/run/epp/api.env,readonly" \
  --mount "type=bind,src=$EPP_CONFIG_DIR/root.crt,dst=/run/epp/root.crt,readonly" \
  -p 127.0.0.1:3374:3000 \
  epp:chapter-73 --env-file=/run/epp/api.env /opt/epp/dist/src/server.js
docker logs --tail 30 epp73-api
curl -i http://127.0.0.1:3374/profile/me
```

先确认宿主 3374 未被原服务占用，或为对照选择另一回环端口。`LISTEN_HOST=0.0.0.0` 是容器内监听，宿主发布仍限定回环。读到匿名 `401 AUTH_REQUIRED` 只证明入口能响应；随后要通过原 HTTPS 名称、旧 Cookie 读旧资料与素材，并实际上传、预览与取回旧头像。`/work` 的 tmpfs 覆盖了镜像目录，因此须显式指定 UID、GID 和 `0700`；只写 `--read-only` 会使头像暂存失败。tmpfs 是可丢弃暂存，不用于 PostgreSQL 或对象持久数据。

代理从宿主或另一容器到 API 后，实际来源地址会改变。现有应用只接受最多十个精确 IP 作为 `TRUST_PROXY_IPS`，不能填服务名、CIDR 或 `true`。默认不信任转发头时，登录限流按代理来源合并；需要保留真实客户端地址时，先验证受控代理的实际 IP，再配置它覆盖转发头，并限制 API 的直接入口。不能仅因 HTTPS 正常就假定代理来源配置仍正确。

## 4. 同一镜像的三个角色与交接验收

镜像默认运行 API。邮件、通知使用同一镜像的不同命令数组，并分别挂载自己的配置文件：

```text
API:    --env-file=/run/epp/api.env /opt/epp/dist/src/server.js
邮件:   --env-file=/run/epp/mail.env /opt/epp/dist/src/mail-worker.js EXPECTED_DATABASE
通知:   --env-file=/run/epp/notify.env /opt/epp/dist/src/mail-worker.js EXPECTED_DATABASE notifications
```

`EXPECTED_DATABASE` 必须替换成交接单的真实库名。邮件配置只有独立数据库身份、日志和 `LOCAL_SMTP_HOST`／`LOCAL_SMTP_PORT`；通知只需自己的库身份和日志。各角色不共享 API 的 S3 凭据或签名密钥。邮件仍是练习收件通道，不因为放进容器就变成真实公网邮件服务。启动新邮件消费者前先停止旧消费者、核对 Mailpit 与积压事实。

原 systemd 能用 `RestartPreventExitStatus=2` 排除人工核对状态，Compose 普通重启策略不能照搬这个排除条件。邮件遇到 `unknown`、`paused` 或 `lost-after-send` 会退出 2；邮件容器采用 `restart: "no"`，保留停止状态，由人查清后再启动。API 的应用停止预算最高 30 秒，Worker 内部为 10 秒；外层停止期限用 40 秒留出清理空间。不要用 Compose 默认 10 秒截断 API 的既有停止过程。

交接时逐项记录：

- 实际 Node、镜像 ID、架构和原生模块计算通过；运行 UID 为 10001，交付文件不可写，暂存根 0700。
- 旧 Cookie、旧收据、旧素材和头像在同一 HTTPS 来源可读；新头像能生成、发布、下载及解码。真实 CA、Host、端口与签名 URL 全链路通过。
- 新注册或改密消息在指定 Mailpit 实收一次，通知按同 ID 入箱；旧 unknown 仍保留人工核对事实，没有自动重复发送。
- 在途上传时 `docker stop epp73-api`，核对应用排空日志、退出状态和暂存清理。重新创建容器后，数据库和桶里的旧结果保持。
- 检查 `docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}}' epp73-api`，区别正常退出、应用失败、外层强杀与内存问题。停止后可移除本轮容器，不能把删容器等同于删数据库。

需要跨机运送时，`docker image save -o epp-chapter-73.tar epp:chapter-73` 导出镜像，在两端用 `sha256sum` 比对同一个包，再 `docker image load -i epp-chapter-73.tar`，检查平台与 image ID。本地镜像标签不自动同步到另一台主机。迁移仍在有明确管理员身份的独立维护环境运行；不要让每个 API 容器启动时自动迁移或重建非空数据库。

新增部署材料的静态检查、镜像实际构建、无数据库检查和整套业务验收是四种不同证据。只有实际运行得到的结果才能写入本轮验收记录。

参考：[Docker Compose 服务配置](https://docs.docker.com/reference/compose-file/services/)、[Node 官方镜像](https://hub.docker.com/_/node)。
