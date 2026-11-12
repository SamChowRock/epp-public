# 第 60 章　对象存储与数据库如何协作

以下命令在本章配套项目根目录运行。需要 macOS、Node 24.22.1 和 PostgreSQL 18。先验证独立桶的边界，再将 API 接入。下载端、服务端和操作终端都在你的同一台 Mac 上。

## 本机安装与监听

```bash
nvm use
npm ci
sh database/chapter-51/install-weed.sh
node database/chapter-51/init-store.mjs
sh database/chapter-51/start-store.sh
```

安装脚本根据原生终端的 arm64 或 x86_64 选择 darwin_arm64.tar.gz 或 darwin_amd64.tar.gz，用内置的 4.52 发行资产 SHA-256 核对压缩包，成功后只取出 weed，以 .chapter51-tools/weed 运行。输出应有 4.52。已有这个文件时，执行 `.chapter51-tools/weed version` 核对版本。安装中保留的压缩包可以重新计算摘要。[固定发行](https://github.com/seaweedfs/seaweedfs/releases/tag/4.52)、[官方资产清单中的 digest](https://api.github.com/repos/seaweedfs/seaweedfs/releases/tags/4.52)

init-store 只在首次运行。它新建权限 0700 的 .chapter51-store 和三份私有文件。s3.json 内有两组独立随机凭据和授权。admin.env 用于建桶，app.env 用于 API 与应用探测，两份凭据文件权限均为 0600。重新启动时保留整个目录并直接运行最后一行。若另开一轮从零跟做，在新的配套副本操作。已有本机 SeaweedFS 配置可以保留。init-store 会另外生成实验专用的 config/filer.toml，选择 data/filerldb2 存储对象名与内容位置。其他组件在同一私有配置目录使用本机默认参数。启动脚本进入 .chapter51-store 并给 weed 指定 -config_dir，因此同名 TOML 优先取自实验目录；系统配置文件保持原样。

服务占用前台，启动行会打印 PID。另开同一目录的终端，把下行中的 12345 替换为这次打印的 PID。监听检查最多等 30 秒，检查此进程的全部 TCP 监听；首次选举完成前 S3 端口也可能已打开，若建桶暂时失败，待日志出现就绪摘要后再执行。

```bash
nvm use
sh database/chapter-51/listeners.sh 12345
node database/chapter-51/store-probe.mjs buckets
node database/chapter-51/store-probe.mjs write
```

应只出现十个 127.0.0.1 地址。18630～18634 依次属于 Master、Volume、Filer、S3、Admin，28630～28634 是对应的 gRPC 端口。Master 跟踪卷的位置，Volume 保存内容，Filer 记录名字到内容的对应。应用只访问 S3 的 18633。关闭 Admin UI 后内部服务仍需监听。本章依赖单用户开发机的回环隔离；共享主机上其他本机用户仍可直连内部端口。私有日志在 .chapter51-store/weed.log，只在本机查看。停止前保留整个 data 目录，包括 filerldb2 与卷文件。[固定版本的 mini 参数](https://github.com/seaweedfs/seaweedfs/blob/4.52/weed/command/mini.go)

**浏览器操作。** 存储运行且已建桶时，用 Chrome 访客窗口打开本机 SeaweedFS Filer（`http://127.0.0.1:18632/`），点 `buckets → avatars`。点 **New Folder** 创建一个名字未被占用的练习目录，进入后用 **Upload** 分别上传 `examples/avatar-preview/harbor.png` 和 `harbor.jpg`。点文件名预览，返回列表，将鼠标移到 PNG 行，点垃圾桶，确认路径后删除。刷新并打开留下的 JPEG。发布真实练习头像后，在桶里的 `avatars/` 目录按 avatarId 查看 WebP。这个界面直通底层存储，业务头像只在这里查看；发布用 Postman，回收用本章按 ID 核验的清理命令。

buckets 用管理身份建 avatars 和对照桶 chapter51-private-control。write 只读 app.env，向 avatars 的 probe/ 下写入两个随机命名的相邻对象。输出应依次说明 HEAD 类型与长度、GET 内容一致，匿名 GET、列举 avatars、跨桶 PUT 均为 403。探测在内存里生成一个两秒 GET URL，立即读取为 200，实际等 3.5 秒后重用同一个 URL 为 403。完整地址含持有者可用的签名；脚本只输出结果。

回到运行存储的终端按 Ctrl-C，等进程退出。用同一数据、身份和端口再运行 `sh database/chapter-51/start-store.sh`，换用新 PID。在操作终端运行：

```bash
sh database/chapter-51/listeners.sh 12345
node database/chapter-51/store-probe.mjs resume
```

resume 读取 write 保存的随机 ID，验证重启后仍可访问原对象，匿名与越权拒绝、签名到期仍成立。它精确删除第一个对象，要求 GET 为 404 NoSuchKey 且第二个字节仍相同，最后清掉第二个。若 write 或 resume 中途失败，先排除端点或权限故障并停下这两个探测程序，运行 `node database/chapter-51/store-probe.mjs reset-probe` 按记录清掉本轮两键，然后重新执行 write、重启和 resume。服务继续开着供 API 连接。

## 升级与启动 API

先在仍运行的第 59 章原版 API 用 05 登录、20 记录账号 ID 和昵称，留住当前会话。停止向该库写入的 API 与 Worker，再按[独立恢复步骤](../chapter-22/backup-restore.md)备份原库并恢复为另建的 epp_ch51_verify，确保原会话已随备份进入副本。对新库运行 [observe.sql](observe.sql) 的前两个查询（替换用户 ID）记下原有字段，再将 .env.database-verify 的 DATABASE_URL 与 .env.test 的 TEST_DATABASE_URL 同时指向这个副本。下方库名按你的建库记录替换。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch51_verify
npm run db:verify -- migrate status
npm run check
```

若用独立空库，把 deploy 换为 bootstrap。按[第 58 章两个账号的准备步骤](../chapter-49/README.md)连接同一个 VERIFY，备好两个已开通练习账号。迁移完成后用 observe.sql 的三条查询复查。本章新增的指针初始为空，头像默认隐藏，现有账号和昵称历史应保持。已有的 .env.test 与 .env.database-verify 均只放本轮数据库配置；S3 身份单独保存在 app.env。

```bash
unset DATABASE_URL TEST_DATABASE_URL PORT APP_ORIGIN DB_QUERY_DEBUG
unset AVATAR_S3_ENDPOINT AVATAR_S3_BUCKET AVATAR_S3_ACCESS_KEY AVATAR_S3_SECRET_KEY
NODE_ENV=development node --env-file=.env.test --env-file=.chapter51-store/app.env --input-type=module -e '
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { withVerifiedDatabase } = await import("./scripts/verify-database.mjs");
await withVerifiedDatabase(process.argv[1]);
process.env.PORT = "3360";
process.env.APP_ORIGIN = "http://127.0.0.1:3360";
process.env.DB_QUERY_DEBUG = "false";
await import("./scripts/dev.mjs");' epp_ch51_verify
```

Postman 导入[本章集合](../../requests/chapter-51.postman_collection.json)，确认 baseUrl 为 `http://127.0.0.1:3360`，先用同一 Cookie 发 20 核对旧账号，过期时重新用 05 登录。只有旧用户 ID 的账号可按[第 58 章说明](../chapter-49/README.md)在 05 的本地副本用 userId 登录。用未同步的本地环境填写密码。清除环境里遮住同名集合变量的旧值，15 按当前 Cookie 取写令牌。

1. A 发 20，把 ID 固定在 profileTargetId，发 15；在 24 的 binary 请求体选择 examples/avatar-preview/harbor.png，先核对原有预览。25 的 binary 也单独选择该文件，200 返回 avatarId。设置 expectedAvatarStatus 为 200，发 26 取得本人的 30 秒短期地址。只比较返回 ID。用 SQL 查到同一 current_id 和 live 行。桶名是 avatars，正式对象的 Key 是 avatars/版本UUID.webp。path-style 地址里连续出现两次 avatars，前一个标识桶，后一个是 Key 的首段。
2. A 将 avatarVisible 设置为 false，发 27、29 核对设置和回查结果。B 发 05、20 确认切换；profileTargetId 保持 A 的 ID，expectedAvatarStatus 设为 404，发 28。再切回 A，05、20、15，设 true 发 27、29。B 重新登录并发 20，将 expectedAvatarStatus 改回 200，再发 28。它可以得到 A 的当前头像；签发 URL 的响应和对象均不应保存到共享日志或截图中。
3. A 重新登录、20、15，把 25 的文件换成 examples/avatar-preview/harbor.jpg，同时把 Content-Type 改成 image/jpeg，再发布。用 observe.sql 查原版本 retired、新版本 live 和当前指针。设置 false 发 27 后，B 再登录、20，以 404 为预期发 28。先前签出的 URL 仍在自己的寿命内有效。完整的同会话签名与到期对照按正文操作。
4. 在第三个终端回到本章项目根。用正文的隐藏输入命令把密码通过 stdin 传给 [race.mjs](race.mjs)，参数为建库时记下的库名、本轮 20 的账号 ID 和 API 源。程序在同一 VERIFY 观察 A 的预订后才送 B，再放完 A 的请求体。保存输出的两个 ID，查收尾顺序和最终引用。

在第三个终端使用应用身份运行处置程序；第一轮只针对已核对的事故，把下面的末项换成它的实际小写 UUID。把目标库名、端点和桶名与建库、监听及建桶记录核对。数据库连接从 .env.database-verify 读取。构建产物需来自本章。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL
unset AVATAR_S3_ENDPOINT AVATAR_S3_BUCKET AVATAR_S3_ACCESS_KEY AVATAR_S3_SECRET_KEY
node --env-file=.env.database-verify --env-file=.chapter51-store/app.env \
  database/chapter-51/clean.mjs epp_ch51_verify http://127.0.0.1:18633 avatars 本轮事故的attempt_id
```

上面只筛选指定的一行；未知 ID、未到期或仍被引用的行不会被删除，也不会改选旁边的候选。旧头像刚被替换时还在保留窗口。等 SQL 的 check_after 到期再运行；需要批量维护时省略最后一个 ID，每次最多取 20 条。Failed 大于 0 时查本机服务、端点、桶与应用身份，在新的检查时间过后重试。已处置的 retired 行会留下，以便后续复查迟到的 PUT。用以下命令分别替换为刚才 SQL 核对的两个尝试 ID，比较当前对象和已到期旧对象：

```bash
node --env-file=.chapter51-store/app.env database/chapter-51/head-avatar.mjs 本轮尝试的UUID
```

全套回归另建 epp_ch51_regression 空库和 .env.test-regression，文件中的 DATABASE_URL、TEST_DATABASE_URL 都填这一个库的连接串。清除外层同名变量后，用本章迁移 bootstrap（已完成的库跳过该命令）：

```bash
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL
node --env-file=.env.test-regression scripts/deploy-verify.mjs bootstrap epp_ch51_regression
```

按[固定测试用户步骤](../chapter-42/README.md)在该测试库准备样本，再运行：

```bash
npm run build
NODE_ENV=test node --env-file=.env.test-regression --test --test-concurrency=1 test/*.test.mjs
```

发布回归使用真实数据库和 HTTP，并在用例内替换对象客户端，独立查竞争、资格和失败窗口。上文 store-probe 与两账号 API 联调用实际 S3。完成后先停 API，再回存储终端 Ctrl-C，等服务退出；如继续下一章，保留本次 VERIFY、配置、数据与练习账号。
