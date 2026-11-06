# EPP 配套实践代码

## 第三十一章 第四篇回顾

从第三十章继续，分支 `part-04/chapter-31` 保持业务代码与迁移不变。用[本章实验](database/chapter-31/README.md)里的 Postman 请求和双会话 SQL，核对两种竞争顺序、成功响应丢失与最后一个预约名额。

## 第三十章 索引与执行计划

本章分支 `part-04/chapter-30` 从第二十九章继续。给学习记录追加一份有序索引，保留接口和旧数据。先按[本章操作说明](database/chapter-30/README.md)在已有数据的校验库保存计划，然后迁移、重读并比较。

## 第二十九章 分页与时间

前置分支 `part-04/chapter-29` 从第二十八章继续，为学习记录和星图提供显式Offset／Cursor分页与UTC半开时间区间。旧请求不传mode时保持原结构；模型、迁移与依赖不变。操作与密钥配置见[本章说明](database/chapter-29/README.md)，导入[请求集合](requests/chapter-29.postman_collection.json)。

游标绑定资源、用户、排序、limit和筛选，整轮有效期30分钟；分页读取实时数据，不承诺固定快照。生产启动新增必填CURSOR_HMAC_KEY；开发／测试未设置时使用进程内随机值，重建应用后旧游标失效。此前章节说明只描述对应版本。

前置章节是第四篇第22章（`part-04/chapter-22`），该章从 `part-03/chapter-21` 最终状态继续。保留旧记录并回填初始修订，新增追加修订和历史查询，旧PATCH改为追加快照，详情／列表读取最新内容。先完成第三篇环境与迁移，再按[第二十二章说明](database/chapter-22/README.md)停写、迁移、核对和切换，旧字段保留初始副本，不再代表当前内容。

第十四章的 1200 单元新建限制、旧记录读取兼容与数组存储属于隔离练习，参考补丁和图形请求仍保留在下方“第十四章综合实践”，不作为当前主服务行为。

主服务集中解析启动配置，提供结构化日志与服务端 X-Request-Id；SIGINT/SIGTERM 先停止接收，再等待已有工作并释放资源。既有三个接口增加可空意图响应，另提供追加意图修改、完整修订和历史读取接口；Problem 契约沿用，关闭期间明确拒绝的新请求使用 503／SERVICE_DRAINING。Swagger 开发默认开启，生产默认关闭。记录保存在 PostgreSQL；API 退出会释放连接并保留已提交行。当前使用固定用户，尚无认证，仅供本机实践。

使用 nvm 管理 Node.js；安装方式见 [nvm 官方说明](https://github.com/nvm-sh/nvm#installing-and-updating)。macOS、Linux 使用 Bash 或 Zsh，Windows 使用 WSL。在项目根目录运行：

```bash
nvm install
nvm use
node --version
npm ci
npm run check
# 先按第三十章说明核对索引迁移，并在 .env 配置运行连接，再启动。
npm run dev
```

`.nvmrc` 固定 Node.js 为 `24.22.1`，`node --version` 应输出 `v24.22.1`。`nvm install` 按文件安装并切换版本；每次新开终端后，在项目内执行 `nvm use`。单独进入目录不会自动切换版本。

Prisma CLI、Client 与 adapter-pg 固定 7.10.1，pg 为 8.16.3；本章连接池逐连接设置 UTC，避免非 UTC 会话下当前适配器的时间偏移。开发启动、类型检查与构建前先生成客户端；模型与锁文件提交，`src/generated/prisma/` 不提交。生成和编译不需要数据库密码，也不执行迁移。数据库命令单独读取 `.env.database` 或 `.env.database-verify`，API 单独从 `.env`／进程读取 DATABASE_URL，不加载 CLI 文件。详见本章说明。

`package.json` 中的 `engines.node` 同样声明精确版本，`.npmrc` 开启 `engine-strict`，让 npm 安装时拒绝不匹配的 Node 版本。遇到 `EBADENGINE` 先执行 `nvm use`，再重试安装。

沿用第十一章的 Zod `4.6.6` 与 @nestjs/swagger `11.4.7`，后者提供 Swagger UI 及其静态资源。其他运行依赖为 Nest `11.2.5`（common、core、platform-express）、reflect-metadata `0.2.2` 与 rxjs `7.8.2`；沿用的独立支线示例显式依赖 Express `5.2.1`，适配器也使用 Express 5，overrides 固定其间接依赖 Multer `2.5.0`。开发依赖保留 TypeScript `5.9.3`、tsx `4.23.15`、`@types/node` `24.13.3`，以及 `@types/express` `5.0.6`。`npm ci` 按锁文件安装完整依赖；`npm run build` 先清理 `dist/`，编译业务源码，再复制默认配置；`npm start` 只运行产物。服务默认监听 `http://127.0.0.1:3000`。默认端口来自 `config/service.json`，启动时由 `src/config.ts`（产物为 `dist/src/config.js`）相对于模块读取，不依赖调用者的工作目录。

以下生产命令都要求先按第二十九章说明配置 CURSOR_HMAC_KEY 和 DATABASE_URL；可以为一次启动覆盖端口：

```bash
NODE_ENV=production PORT=3001 node --enable-source-maps dist/src/server.js
```

`PORT` 必须为十进制数字字符串，转换后的整数范围是 1～65535；缺失时使用默认端口，空值或错误值会在监听前退出并返回非零状态。即使指定 `PORT`，默认配置文件仍必须存在且有效。配置由每个服务进程在启动时读取；dev 会在源配置变化后复制并重启，生产产物则需要重新构建，修改生产运行目录的默认配置后需重启；绑定地址始终为 `127.0.0.1`。改端口后同步修改请求地址。

沿用第二十二章的[修订历史请求集合](requests/chapter-22.postman_collection.json)，逐项核对完整追加、旧PATCH、最新读取和历史翻页。前章集合仍可观察原有输入边界；第二十一章三版本实验与补丁应回到对应章节分支操作，不能对当前修订库运行旧写入者。

## 用 Postman 发送和保存请求

保持 `npm run dev` 运行。在 [Postman 桌面客户端](https://www.postman.com/downloads/) 中选择 **Import**，导入 [requests/epp.postman_collection.json](requests/epp.postman_collection.json)，打开“EPP 本机接口调试”集合。已有同类客户端也可以按相同方法、地址、头部和正文创建请求。

1. 打开“01 查看列表”，点击 **Send**，查看响应状态、Body 和 Headers。应返回 200 与前章已有的数据库记录。
2. 打开“02 创建原文”，在 **Body → raw → JSON** 修改 originalText，点击 Send，查看 201、返回的 id 和响应头 Location。
3. 将实际 id 填入集合 **Variables** 的 captureId，再发送“03 查看详情”，应返回 200。baseUrl 默认是 `http://127.0.0.1:3000`；改端口时一起修改，发送前核对变量解析后的实际 URL。所选环境中的同名变量可能覆盖集合变量。
4. 集合还保存了字段类型错误、JSON 格式错误、内容类型错误与详情不存在的输入，分别观察 400、400、415、404，再查看列表确认失败没有新增记录。各章错误正文以当前实现为准。

需要修改请求时，在 Headers、Body 或 Params 中编辑，保存后可反复点击 Send；查询条件由 Params 处理 URL 编码，第八章起再使用 q／limit。保存源码后等待服务自动重启，再点 Send 查看新响应；重启保留数据库记录；按已保存 captureId 继续查询，不必重复创建。每次 POST 都可能新增记录，集合保存的是请求，不会自动发送或保留服务数据。

调试时保持同一个请求，在源码中设置断点后点击 Send。暂停期间客户端会等待；继续执行后才会收到响应。第五章起可用 VS Code 的 `EPP: attach to npm run dev` 自动重连，前面章节通过 Chrome 的 `chrome://inspect` 连接；重启后若连接断开，重新选择目标。生产运行方式见文末，日常学习保持 dev 模式。

下面的 curl 是同一请求的终端表示，用于复制复现；日常可直接使用集合里的请求。

```bash
curl -i http://127.0.0.1:3000/captures
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"I am not much of cook."}'
```

创建成功返回 `201`，复制响应中的 `id`，用 `GET /captures/<id>` 查看详情。列表返回 `{ "items": [...] }`。同一正文重复提交会创建两条记录。创建可以省略 chineseIntent，响应明确返回 null；PATCH 必须提供该字段，字符串替换、null清空、缺失或空白拒绝。意图最多2000个UTF-16单元，原文和创建时间不由PATCH修改。q只搜索最新修订的原文。PATCH每次成功都会追加一版，重复发送并非幂等；并发争号可返回409／REVISION_CONFLICT。完整修订接口和历史范围参数见第二十二章说明。

原文必须是无 NUL、无孤立代理项的非空白字符串，至多 2000 个 JavaScript UTF-16 代码单元；保留原始空格。q 同样拒绝不可原样表示的文本。请求体限制为 16 KiB，须为不带 BOM 的合法 UTF-8 JSON；非法编码不会被替换后写入。错误通过 HTTP 状态码与 `application/problem+json` 返回，包含 type、title、status、detail、code，字段校验失败还包含 issues。旧客户端读取 error 的逻辑需要改为使用新结构：无效输入 `400`、不存在 `404`、方法不支持 `405`、请求体过大 `413`、内容类型不支持 `415`。

保持 `npm run dev` 运行，在 Chrome 的 `chrome://inspect` 中打开 Node 调试目标，连接后，在 `src/captures.service.ts` 的 `await this.store.insert(capture)` 和 `src/prisma-capture.store.ts` 的数据库写入处设置断点并再次发送创建请求。调试器仅监听本机 `9229` 端口。停止时，在运行服务的终端按 `Ctrl+C`。

当前主服务已接入数据库，尚不包含登录、AI、CORS 配置和生产部署。第十三章统一协调 `SIGINT`／`SIGTERM`：停止接收、等待传输和已追踪工作、释放资源；达到关闭期限时以失败状态退出。完整原理与操作步骤见 [EPP 后端开发实践](https://github.com/SamChowRock/EPP-Book)。

第二章支线“从字节到 JSON”另有独立示例。在项目根目录执行：

```bash
nvm use
node examples/buffer-boundary.js
```

示例主动切开一个 UTF-8 字符，对照逐块解码、合并后解码和 `StringDecoder` 的输出；无需启动 HTTP 服务。

## 第三章运行环境示例

以下从项目根目录运行，均不需要监听端口：

```bash
node examples/runtime-context.js
PORT=3001 node --no-warnings examples/runtime-context.js --label demo
printf 'EPP runtime\n' | node examples/echo-stdin.js
node examples/file-note.js
node examples/cwd-config.js
```

- `runtime-context.js`：观察 PID、cwd、Node 路径、参数和指定环境变量。输出包含本机路径，分享前检查隐私。
- `echo-stdin.js`：小输入的标准通道观察示例；正文用重定向分别查看 stdout 与 stderr，不作为大文件转发实现。
- `file-note.js`：在独立临时目录中新建并读回演示文件。进程结束后文件保留，按输出位置删除自己创建的演示目录即可；临时目录不是业务持久化位置。
- `cwd-config.js`：刻意保留 cwd 相对读法的失败示例，不是服务的配置实现。

先执行 `npm run build`。从 `src/` 运行错误示例应出现 `ENOENT`，而服务产物使用模块相对配置，可从这个目录直接启动：

```bash
(
  cd src
  node ../examples/cwd-config.js
  NODE_ENV=production PORT=3001 node --enable-source-maps ../dist/src/server.js
)
```

也可以只读取配置，不启动服务。在项目根目录执行：

```bash
node --import=tsx --input-type=module -e 'import { loadConfig } from "./src/config.ts"; const c = await loadConfig(); console.log({ port: c.port, mode: c.mode });'
NODE_ENV=production PORT=3001oops node --enable-source-maps dist/src/server.js
echo $?
```

最后一次启动应输出配置错误，退出码为 `1`。默认文件损坏、字段类型错误或文件缺失也会在监听前拒绝启动。`npm start` 会在包根目录运行脚本，观察 cwd 差异时使用上面的直接 `node` 命令。

## 第三章知识支线与路径变式

正文的 `path-report.js` 只展示路径解析，不读写传入文件：

```bash
node examples/path-report.js ./input.json
(
  cd src
  node ../examples/path-report.js ./input.json
)
```

两次输出的模块配置位置相同，用户输入与导出目录随 cwd 改变。输出包含本机路径，分享前检查个人信息。

支线 3A 使用 `stdio-result.js` 将一份 JSON 输出到 stdout，将诊断说明输出到 stderr；配合 `echo-stdin.js` 观察重定向与管道。正文给出了 `2>&1` 顺序与 `pipefail` 的对照，不要把两路输出混合后的内容当成合法 JSON。

支线 3B 的示例只修改自己创建的临时目录，结束时自动清理：

```bash
node examples/file-permissions.js
node examples/file-handle.js
node examples/file-handle.js --fail
echo $?
```

权限示例按普通账号、POSIX 常规文件权限解释；管理员权限、ACL、沙箱和挂载方式可能改变结果。句柄示例的 `--fail` 路径刻意在写入后抛错，应返回 1，但仍执行关闭，并在清理之前重新读到已写内容。关闭资源不回滚写入。

支线 3C 用短定时任务比较两种停止策略，无需 HTTP 端口：

```bash
node examples/signal-lifetime.js log-only
node examples/signal-lifetime.js drain
```

每次看到 `ready` 和工作开始后，在该终端按 `Ctrl+C`。`log-only` 只记录信号，仍会继续开始新工作，十秒演示时限会停止调度并返回失败；`drain` 停止调度，等待已接受工作完成，清理剩余定时器后自然退出。按顺序分别完成两次观察，不需要同时运行。这个有限任务示例用于解释资源与工作归属，不替代服务的 HTTP／数据库生命周期实现。

## 第四章事件循环与执行边界示例

继续从项目根目录运行，沿用 Node.js `24.22.1`，这些 JavaScript 示例没有第三方依赖。记录接口保持前文行为，以下实验不增加业务路由。

先在一个终端运行 `PORT=3000 npm run dev`；在 Postman 保留主线集合的列表请求，另一个终端用慢速上传与独立 GET 观察请求重叠。下面的 curl 用于控制并发时序；日常查看结果仍可点击列表请求的 Send：

```bash
node examples/slow-upload.js &
upload_pid=$!
sleep 0.2
curl -sS -w '\nlist total=%{time_total}s\n' http://127.0.0.1:3000/captures
wait "$upload_pid"
curl -sS http://127.0.0.1:3000/captures
```

先确认服务已收到 POST、上传尚未完成：第4章快照的服务日志输出 JSON，其中 event 为 http.request、method 为 POST；后续章节日志格式演进后，按对应章的入口事件核对。期间列表仍应能返回；之后列表增加本次原文。改服务端口时同步改客户端与 curl 地址。重复运行会创建新记录。

独立实验服务使用 `127.0.0.1:3002`。先停止主服务，释放共用的 Inspector 端口 9229，再启动实验：

```bash
NODE_ENV=development node --watch --watch-preserve-output --inspect=127.0.0.1:9229 examples/event-loop-server.js
```

在 Postman 导入 [requests/event-loop.postman_collection.json](requests/event-loop.postman_collection.json)，集合变量 experimentBaseUrl 为 http://127.0.0.1:3002，与主线集合分开。四条 GET 请求分别观察 /quick、/wait、/block、/slice，逐条 Send；集合不自动运行或重放请求。Chrome 的 chrome://inspect 可连接实验；观察处理分支时使用断点，测量并发和耗时时先禁用断点并恢复执行。

保存源码后 Node 会重启实验进程，待监听日志重新出现再发请求；语法或启动错误时先读终端错误，修复保存后确认监听，不能拿旧结果页当作已恢复。运行中途停止后，下次使用同一命令和已保存的请求继续。

等待打印监听地址后，在另一个终端执行：

```bash
curl -sS -w '\nslow total=%{time_total}s\n' http://127.0.0.1:3002/wait &
slow_pid=$!
sleep 0.1
curl -sS -w '\nquick total=%{time_total}s\n' http://127.0.0.1:3002/quick
wait "$slow_pid"
```

把第一条 URL 的 `/wait` 分别换成 `/block`、`/slice`，每轮完成后再开始下一轮。对照快请求顺序与 curl 的总耗时，再看服务里的 100 ms 探针。`/wait` 是定时器等待；`/block` 连续计算约 600 ms；`/slice` 分段让事件循环推进，仍累计消耗约 600 ms 计算时间。实验只供本机短时观察，结束后在当前实验服务终端按 `Ctrl+C`。

以下程序不需要监听端口：

```bash
node --unhandled-rejections=strict examples/async-failure.js caught
node --unhandled-rejections=strict examples/async-failure.js detached
node --unhandled-rejections=strict examples/async-failure.js callback
node examples/timeout-cancel.js race
node examples/timeout-cancel.js cancel
node examples/timeout-cancel.js fast
node examples/bounded-batch.js
UV_THREADPOOL_SIZE=1 node examples/thread-pool.js
UV_THREADPOOL_SIZE=4 node examples/thread-pool.js
```

异常程序三种模式均返回 1，后两种刻意展示未处理异常；需要看退出码时，紧接单次运行执行 `echo $?`。race 模式调用方结束后工作仍继续，cancel 模式应先收尾工作再报告超时，fast 模式正常返回。分批程序在第 3 项失败后等第 4 项结束，不再接受第 5、6 项，最后显示 `active=0, peak=2` 并返回 1。线程池的派生参数仅作原生计算负载，不是业务密码配置；观察完成时间分布，避免将打印顺序或某次毫秒数当成调度保证。

支线 4A 的顺序与有限饥饿实验：

```bash
node examples/scheduling-order.js
node examples/scheduling-order.js --starve
```

分别比较 ESM 顶层与 I/O 回调中的 nextTick／微任务顺序，以及 `--starve` 对定时器和 I/O 回调的延后。

支线 4B 的一次性线程协议：

```bash
node examples/worker-boundary.js main
node examples/worker-boundary.js worker
node examples/worker-boundary.js fail
node examples/worker-boundary.js empty
node examples/worker-boundary.js timeout
```

main 与 worker 对照父线程探针和计算完成的先后；后者修改输入副本，父线程的 note 保持不变。fail、empty、timeout 分别报告异常、无结果退出与期限终止，并返回 1。完整示例同时等待结果和退出，只处理无外部副作用的计算，不代替持久化后台任务或生产线程池。


## 调试 TypeScript 服务

用 VS Code 打开配套代码仓库根目录，在终端执行 `nvm use` 并核对 `node -v`。日常运行 `npm run dev`，在 Run and Debug 选择 `EPP: attach to npm run dev`；默认连接 .dev 产物，保存后自动编译、重启并尝试重连。

需要观察启动第一行或构建产物时，先停止 dev，再选择 `EPP: build and launch`；也可依次执行 `npm run build`、`npm run debug`，选择 `EPP: attach to npm run debug` 并继续执行。两条路线使用 dist；launch 和 debug 都使用 development，并加载本机 .env。业务 HTTP 端口与 Inspector 端口承担不同职责，不同时启动多个占用相同端口的进程。

源码断点依赖目标产物的 .map 与当前源码。dev 的 outFiles 指向 .dev，构建调试指向 dist；空心断点先核对目标进程、编译产物和映射。Scope、Watch、调用栈、条件断点、日志点与已捕获异常的用法见支线 5B。Nest 章节的断点放到各自的 Controller、Service 或错误边界。

## 第五章类型、模块与构建

开发入口与产物入口分别运行，不要同时占用默认端口：

```bash
npm run dev
```

第五章建立的默认开发入口继续使用项目锁定的 TypeScript watch 将源码编译到 `.dev`，本章新增的装饰器元数据也由编译器生成。只有编译无错误才重启服务；类型错误会停止旧服务，修复保存后恢复，重启保留 PostgreSQL 记录。`npm run typecheck` 单独检查，`npm run build` 生成独立的 `dist`；核对产物时用 `PORT=3001 npm start`，与开发端口区分。构建产物保留 `dist/src/` 与 `dist/config/` 的相对关系，默认配置是构建时复制的快照。

仅查看不使用装饰器的 `src/config.ts` 或运行第五章独立示例，仍可使用 `node --import=tsx`；当前 Nest 应用入口必须按上述 tsc 路径构建运行，不能直接用 tsx 替代。源码中的 `.js` 导入继续匹配最终产物。

类型断言不验证输入的独立失败示例：

```bash
node --import=tsx examples/type-boundary.ts
echo $?
```

输出实际字段类型 `number` 后在 `trim()` 处抛错，返回非零状态。它不参与服务的 `tsconfig.json` 构建范围。

开发工具理解别名、原生 Node 不理解同一别名的对照：

```bash
TSX_TSCONFIG_PATH=examples/alias/tsconfig.json node --import=tsx examples/alias/main.ts
npm exec -- tsc -p examples/alias/tsconfig.json
node dist/alias/main.js
```

前两步成功，最后一步刻意失败。观察产物保留的 `@demo/value`，再按正文改为 `./value.js` 对照。下一次服务构建会清理独立示例的产物。

支线 5A 的模块实验无需监听端口：

```bash
node examples/modules/consumer.js
node examples/modules/consumer.js relative
node examples/modules/consumer.js private
node examples/modules/consumer.js extensionless
node examples/modules/consumer.js require
```

前两次成功；后三次分别刻意触发包子路径未导出、缺少扩展名、ESM 中裸 require 不存在，均返回非零状态。包自引用依赖 `examples/modules/package.json` 的名称与公开入口，不是全局安装。

完成服务构建后，在独立目录核对运行单元。先停止上一轮占用 3001 的产物服务；Postman 使用集合副本，将 baseUrl 设为 http://127.0.0.1:3001：

```bash
npm run build &&
release_dir=$(mktemp -d) &&
cp package.json package-lock.json .npmrc .nvmrc "$release_dir/" &&
cp -R dist "$release_dir/dist" &&
(
  cd "$release_dir" &&
  npm ci --omit=dev &&
  PORT=3001 npm start
)
```

运行目录不含源码和开发工具，不支持重新构建。保留当前 shell 的 `release_dir`，停止服务后可从其他 cwd 使用绝对入口和 `PORT=3001` 再运行；配置仍从运行目录里的 `dist/config/` 读取。默认配置缺失应在监听前失败。本章需先通过进程环境提供 DATABASE_URL 且保持 DB_QUERY_DEBUG=false；可在独立目录用 VS Code 新建本机验证专用 `.env`，按 `.env.example` 填写后改用 `NODE_ENV=production PORT=3001 node --env-file=.env dist/src/server.js`，验证结束移除该秘密文件，正式部署仍由环境注入。按正文再次核对四个接口、错误输入与重启保留数据，结束后只清理自己新建的临时目录。


## 第六章独立实践参考

`part-01/chapter-06` 的主服务保持第五章状态。`examples/chapter-06-source.patch` 保存可选来源标签的独立实现，供完成自主实践后对照；该字段不进入第七章及后续主线。

自己从空目录跟写、普通克隆和单分支克隆都可使用同一路径：保留当前项目，另建资料目录。以下每条命令成功后才执行下一条；已有目录用 `git worktree list` 找回练习，不覆盖它。

```bash
main_dir=$(pwd)
git clone --single-branch --branch part-01/chapter-06 \
  https://github.com/SamChowRock/epp-book-code.git ../epp-chapter-06-materials
cd ../epp-chapter-06-materials
git fetch origin refs/heads/part-01/chapter-05:refs/remotes/origin/part-01/chapter-05
git worktree add -b practice/chapter-06-source ../epp-chapter-06-source origin/part-01/chapter-05
```

进入 `../epp-chapter-06-source`，执行 `nvm use`、`npm ci`，按正文独立实现。远程分支记录 `origin/part-01/chapter-05` 已由显式 fetch 建立，不依赖同名本地分支；原项目无需初始化 Git。

查看参考：`git show origin/part-01/chapter-06:examples/chapter-06-source.patch`。需要运行参考时，在资料目录执行 `git worktree add -b practice/chapter-06-reference ../epp-chapter-06-reference origin/part-01/chapter-05`；成功后进入该目录，执行 `git show origin/part-01/chapter-06:examples/chapter-06-source.patch | git apply -`，然后安装依赖、类型检查、构建与启动。不要在已有个人成果上直接应用补丁。结束后用 `cd "$main_dir"` 回到原项目；重开终端后用自己记录的原路径。详细需求、隔离步骤与响应观察见第六章。

## 第七章建立的 Nest 组装与业务边界

第七章先从职责变化比较手动组装与框架组织，再解释 Nest 的控制反转、依赖注入、模块封装与平台适配。独立示例在完成构建后运行：

```bash
node examples/manual-composition.mjs
```

`makeEntry` 通过普通函数参数接收 Service，两个入口共享同一实例时打印 `shared entry count: 1`。第九章新增 `another service, same store: 1`，说明不同 Service 可以共享同一存储；使用独立 MemoryCaptureStore 的入口打印 `isolated entry count: 0`。这只观察同一进程内的对象关系，不表示未来独立运行的 HTTP 与 CLI 进程共享 Map。

- `src/captures.service.ts`：原文规则、记录创建与查询；第九章接收 CaptureStore，不再直接持有 Map。
- `src/capture.ts`、`src/capture-store.ts`、`src/memory-capture.store.ts`：模型、存储契约与内存实现，复制写入与读取对象，保留查询语义。
- `src/captures.controller.ts`：四个 HTTP 入口；第八章改用 Nest 返回值响应，创建用 passthrough 设置 Location。
- `src/http.ts`：沿用流读取、16 KiB 限制与 JSON 输出，转换业务和协议失败。
- `src/http-boundary.ts`：路由前核对路径与允许方法，保留 404／405、Allow 和原始 ID 行为。
- `src/captures.module.ts`、`src/app.module.ts` 与 `src/app.ts`：第十章由记录模块拥有组件登记，根模块导入它；创建 Nest Express 应用时关闭默认解析器，由 captureBody 在路由前唯一读取 JSON。
- `src/server.ts`：加载启动配置、监听以及启动失败收尾。

路径仍精确匹配；`/Captures` 和 `/captures/` 不等于 `/captures`。HEAD 与 OPTIONS 仍返回 405；没有增加 CORS。详情 ID 按原始路径段查询，生成的 UUID 直接用于请求地址。未知业务异常返回通用 500，诊断保留在服务端。

构建后运行无需 HTTP 端口的示例：

```bash
npm run build
node examples/nest-metadata.mjs
```

观察 Controller 的构造依赖为 `CapturesService`、类值相等；原文副本修改不影响存储，空白输入拒绝且不新增记录，另建 Service 并传入独立 MemoryCaptureStore 时列表为空。

支线 7A 对照移除元数据的产物：

```bash
npm exec -- tsc --emitDecoratorMetadata false
node examples/nest-metadata.mjs
npm run build
node examples/nest-metadata.mjs
```

中间一次应显示依赖描述 `undefined`、类值相等为 `false`，手动构造的业务调用仍成立。实验覆盖了产物，必须执行最后的构建恢复，随后再启动 HTTP 服务。TypeScript 配置文件本身没有改变。


### 支线 7A：装饰器的执行与路由注册

```bash
npm exec -- tsc -p examples/decorators/tsconfig.json
node dist/decorators/mini-router.js
```

`examples/decorators/mini-router.ts` 只用传统 TypeScript 装饰器和普通 JavaScript 注册表，不导入 Nest、不监听端口。先观察方法／类装饰器在 `before new` 之前执行，再看到 `/notes/preview` 注册并返回 `saved: hello`；`/preview` 不匹配。按支线改变 Group 前缀并重新编译，观察地址变化，再恢复。这个示例关闭自动类型元数据，以区分自行记录路由与编译器发出类型描述。服务 build 会清理其产物，需要时重新执行上述命令。

### 支线 7B：Express 请求链

```bash
npm run dev:express
```

独立监听 `127.0.0.1:3003`。先停止其他 dev，使用 VS Code 的 `EPP: attach to npm run dev`；该 JavaScript 示例直接在源文件设断点，Node watch 保存后自动重启。导入 [Express 请求集合](requests/express-pipeline.postman_collection.json)，逐条 Send；挂起请求等约两秒后 Cancel。需要客户端超时对照时，在 Postman 设置中找到 Request Timeout，记下原值、临时设 2000 毫秒，观察后恢复；暂停断点时不要使用短期限。

修改一处响应、保存、等监听日志、再发同一请求核对；不要同时启动占用 9229 的其他实验。开发环境文件改变后仍需手动重启。下面仅为同一请求的终端表示：

```bash
curl -i http://127.0.0.1:3003/wait
curl -i http://127.0.0.1:3003/stop
curl -i http://127.0.0.1:3003/fail
curl -i http://127.0.0.1:3003/callback-fail
curl -i http://127.0.0.1:3003/missing
curl --max-time 2 -i http://127.0.0.1:3003/hang
curl -i http://127.0.0.1:3003/echo \
  -H 'Content-Type: application/json' --data '{"message":"hello"}'
curl -i http://127.0.0.1:3003/echo \
  -H 'Content-Type: application/json' --data '{'
node --input-type=module -e 'process.stdout.write(JSON.stringify({message:"a".repeat(1100)}))' |
  curl -i http://127.0.0.1:3003/echo \
    -H 'Content-Type: application/json' --data-binary @-
```

依次应得到 200、403、500、500、404、客户端超时、200、400、413。结合日志区分 next 返回与响应 finish；正常 echo 看到 body 已解析，失败输入不进入该路由。实验的 JSON 上限为 1 KiB，EPP 仍为 16 KiB；观察完按 Ctrl+C 停止独立进程。


## 第八章 Controller 输入与响应

`src/capture-query.ts` 把单值查询转换为业务参数，`src/capture-body.ts` 负责 POST／PATCH 的唯一 JSON 读取；第十二章已把原来的 httpResult 替换为 `src/problem.filter.ts` 的统一 Problem 处理。四个 Controller 方法返回业务结果，创建时只设置 Location。成功响应的自动头部可能变化，业务状态、JSON 和 Location／Allow 约定继续保持。

```bash
curl -i 'http://127.0.0.1:3000/captures?q=coffee&limit=1'
curl -i 'http://127.0.0.1:3000/captures?limit=1&limit=2'
curl -i --get --data-urlencode 'q=C++ & Node' http://127.0.0.1:3000/captures
```

q 大小写敏感、按字面子串匹配，提供时非空白且最多 200 个 UTF-16 代码单元；limit 是 1～100 的十进制整数文本，不接受前导零、小数和指数。重复已知参数拒绝，未知字段忽略。当前主服务先按固定归属和字面条件筛选，再按 created_at/id 升序截取；没有参数时仍返回全部匹配记录，未增加分页。失败不改变已有记录。

支线 8A 无需服务端口：

```bash
node examples/url-inputs.mjs
```

观察加号与空格、get 与 getAll、百分号只解码一次，以及构造参数值后片段不进入请求目标。

支线8B使用独立开发入口监听3005：

```bash
npm run dev:responses
```

先停止其他 dev，VS Code 继续使用 `EPP: attach to npm run dev`。产物在 .dev，保存 TypeScript 或实验配置后自动编译重启。导入 [响应责任请求集合](requests/controller-responses.postman_collection.json)，默认3005；先发自动响应，把响应 Headers 的完整 ETag（含双引号与可能的 W/）填入集合 etag，再发匹配请求。检查实际 Headers，禁用客户端额外添加的 Cache-Control: no-cache，避免它要求重新获取完整正文。遗漏响应用 Cancel 或临时2000毫秒 Request Timeout观察，断点时恢复较长等待。修改源码保存，等监听成功再发同一请求；普通 build 清理dist不影响这些开发产物。

下面仅为上述图形请求的终端复现：

```bash
curl -i http://127.0.0.1:3005/responses/automatic
curl -i http://127.0.0.1:3005/responses/accepted -H 'Content-Type: application/json' --data '{"message":"hello"}'
curl -i http://127.0.0.1:3005/responses/manual
curl -i http://127.0.0.1:3005/responses/passthrough
curl --max-time 2 -i http://127.0.0.1:3005/responses/forgotten
```

依次为 200、202、200、200、客户端超时。passthrough 带 X-Example；forgotten 的方法返回并不触发自动发送。按支线先改为 passthrough，再改成手动 json，对照两种完成方式；每次保存后等待自动编译重启，再发已保存的请求观察，最终恢复原示例。独立应用默认启用 Nest 的 JSON 解析器，与主线不同；临时关闭时 accepted 不再得到 body，观察后恢复。实验结束按 Ctrl+C 停止进程。

### 查询容量与条件读取

从第八章开始，业务入口在 simple 查询解析前拒绝超过 1000 个 `&` 分隔片段的查询（400），包括未知字段和空片段，避免尾部 q 或重复参数被静默丢弃。上限内的未知字段仍忽略。

自动响应会生成 ETag。GET 带匹配的 `If-None-Match`（或 `*`）时可能返回 304，没有响应体及 JSON Content-Type；客户端应复用已有缓存。不带条件或条件不匹配时返回 200 JSON。主线仍不开放 HEAD（405）。此行为从第八章起承接 Express 的条件响应语义，具体操作见支线 8B。


## 第九章存储契约与 Provider

- `capture-store.ts` 同时导出类型接口与唯一 Symbol 令牌，两者分别服务于静态检查与运行时查找。
- `MemoryCaptureStore` 实现异步契约，Map 仍是同步内存操作；存储副本、查询语义与不存在／故障区分由契约约定。
- 使用 useClass 提供存储，以 useFactory／inject 创建普通 CapturesService；第十章将这组登记移入 CapturesModule。Controller 在成功写入后设置 Location，列表先等待再包装。

先观察慢写入和失败写入如何影响业务完成，以下程序只操作独立内存对象：

```bash
node examples/storage-completion.mjs slow
node examples/storage-completion.mjs fail
```

slow 在 write finished 后才打印 creation succeeded，记录数为 1；fail 打印 creation failed，记录数为 0。拿到 Promise 不代表记录已经保存。正文另提供两段直接运行 src 文件的短对照，允许在 Nest 组装尚未接回时先检查普通业务对象。

独立固定详情示例无需监听端口：

```bash
npm exec -- tsc -p examples/provider-values/tsconfig.json
node dist/examples/provider-values/main.js
```

useValue 提供固定 find，返回 demo-capture。其 insert 和 list 明确失败，不代表真实持久化，也不替换主线 HTTP 应用。应用容器由 finally 关闭。

支线 9A：

```bash
npm exec -- tsc -p examples/provider-identity/tsconfig.json
node dist/examples/provider-identity/main.js alias
node dist/examples/provider-identity/main.js class
node dist/examples/provider-identity/main.js wrong-token
node dist/examples/provider-identity/main.js missing
node dist/examples/provider-identity/main.js fail-factory
```

前两次成功：alias 的对象相同且两处均读到一条；class 的对象不同，具体类注册为空，令牌对应实例有一条。后三次刻意返回 1，分别暴露不同 Symbol、缺少注册和初始化失败；单独运行并紧接 echo $? 查看退出状态。Reader 的 design type 为 Object，真正身份来自 Inject。

支线 9B：

```bash
npm exec -- tsc -p examples/provider-scopes/tsconfig.json
node dist/examples/provider-scopes/main.js
```

输出共享计数 1、同上下文 Reader 相同、不同上下文不同、请求计数 1／0；两个消费者不共享 transient Stamp，同一消费者保留自己的 Stamp。按支线临时把 Stamp 或 RequestCounter 改成默认作用域，重新编译观察后恢复。显式上下文不代表真实 HTTP 请求或用户身份。所有示例产物在常规 build 后需重新编译。


## 第十章模块边界与循环依赖示例

下面这一节在 `part-02/chapter-10` 快照中运行，保持原来的内存语义。module-consumer 和 module-workflow 直接导入 CapturesModule；若在当前分支运行，它们会连接数据库并写入，已不适合用来观察原章节的隔离 Map 结果。回看原实验请使用对应快照。

先完成主项目构建，再单独编译示例。`npm run build` 会清空 dist，重新构建后要重新执行对应示例的 tsc 命令。以下程序各自创建应用上下文，不与另一个 HTTP 进程共享内存，也不增加业务路由。

```bash
npm run build
npm exec -- tsc -p examples/module-consumer/tsconfig.json
npm exec -- tsc -p examples/module-visibility/tsconfig.json
npm exec -- tsc -p examples/module-workflow/tsconfig.json
npm exec -- tsc -p examples/module-cycles/tsconfig.json
node dist/examples/module-consumer/main.js
node dist/examples/module-visibility/main.js shared
node dist/examples/module-visibility/main.js duplicate
node dist/examples/module-visibility/main.js reexport
node dist/examples/module-workflow/main.js
```

摘要输出一条原文；shared 与 reexport 输出同一 Service、两侧数量均为 1，duplicate 输出不同 Service、数量为 1／0。预览程序创建一次、展示两次，最终记录数为 1。

下面各命令用于观察启动失败，应单独运行：

```bash
node dist/examples/module-visibility/main.js hidden
node dist/examples/module-visibility/main.js root-only
node dist/examples/module-visibility/main.js private
node dist/examples/module-visibility/main.js bridge
node dist/examples/module-workflow/cycle.js
```

四种可见性失败分别是未导出 Service、只有根模块导入、消费者直接要求内部存储、中间模块没有再导出。cycle 则是两个工厂互相要求对方实例，均以非零状态退出。更完整的关系与修法见第十章，不通过重复登记或扩大所有导出来掩盖失败。

支线先观察 ESM 求值，再观察双向类关系：

```bash
node examples/module-cycles/esm-a.mjs
node examples/module-cycles/esm-a.mjs eager
node dist/examples/module-cycles/main.js linked
node dist/examples/module-cycles/main.js hidden
node dist/examples/module-cycles/main.js eager
```

ESM 默认输出 A，eager 在初始化前读取类而失败。双向类程序 linked 输出两者互相引用、字段已经可用、元数据为 Object；hidden 因缺少导出失败；eager 因构造时读取尚未准备好的对方字段失败。显式 Inject 决定运行时令牌；Pick 类型避免该示例的参数元数据提前读取后声明的类。forwardRef 不替代模块导出，不保证构造次序，也不修复主线的工厂环。

独立 HTTP 实验默认也使用开发调试。TypeScript 实验的 `tsconfig.dev.json` 继承自身编译配置，只把 outDir 改为 .dev；`scripts/dev.mjs` 的第一个可选参数选择输出入口，第二个选择编译配置，不传时仍运行主线。主线与实验共享9229，一次只运行一个；实验的监听地址成功出现后再 Send。它们不挂入 AppModule，生产构建不包含 examples，也不复制 .dev。

## 开发与生产运行

运行模式由命令明确提供：`npm run dev` 和 `npm run debug` 使用 development，`npm start` 使用 production。NODE_ENV 决定库与应用的环境行为，文件监听和 Inspector 则由命令参数分别控制；更改模式要重新启动进程。请用开发进程修改代码，用独立的交付运行核对实际产物，不把本机调试服务当作生产进程。

请求日志记录服务端编号、方法、固定路由标签、状态与耗时，不写原始 URL、查询值、原文或凭据。内部失败只记录稳定错误码，不输出原异常消息/堆栈。正常存储耗时为 debug；需要核对实际输入时使用自己保存的 Postman 请求与开发调试器。

学习和日常修改默认使用 `npm run dev`。scripts/dev.mjs 使用项目锁定的 TypeScript watch 与 tsconfig.dev.json 编译到 .dev，成功后复制配置并启动开启本机 Inspector 的服务；保存源码、修改 tsconfig.json 或 config/service.json 后自动重启。类型错误时停止旧服务，修复保存后恢复；终端的 Build succeeded 只表示编译成功，还要看到服务监听日志。重启保留数据库记录，浏览器页面不会自动刷新，需要重新发请求。

先在终端运行 dev，再在 VS Code 选择 `EPP: attach to npm run dev`；`restart: true` 会在服务重启后尝试重连，断点保留。Chrome 可从 chrome://inspect 连接，但重启后可能需要重新选择目标。只有排查启动第一行才使用 `npm run build` 和 `npm run debug`；dev与debug不要同时占用9229或业务端口。dev 使用 .dev，build/clean 使用 dist，二者不会相互清理；并行检查不会自动重启开发服务。依赖、package.json、开发脚本及环境变量改变后手动重启dev。此时的自动重启不保留进程内状态。

生产方式先 `npm ci`、`npm run build`，再按第五章准备运行目录，仅安装运行依赖（`npm ci --omit=dev`），执行 `npm start`。start只运行构建产物，不开启Inspector或文件监听；生产环境不运行dev/debug。配置已复制进dist，修改源配置不会自动更新生产产物。环境变量按部署目标提供；NODE_ENV=production本身不会替代构建或自动关闭调试。完整进程托管、HTTPS与发布恢复在部署篇展开。


## 第十一章输入、公开响应与接口文档

查询超过 1000 项时返回 `QUERY_TOO_LARGE`；非法 UTF-8、BOM 或 JSON 语法失败返回 `INVALID_JSON`。两个 GET 的 OpenAPI 同时描述 If-None-Match、ETag 以及没有正文的 304。

关键文件：capture-contract.ts 定义输入和公开响应；input-validation.ts 只把输入失败转为 400；第十二章由 Pipe 解析输入、Interceptor 按公开 Schema 投影响应；http.ts 统一描述 Problem；openapi.ts 从 Schema 生成字段描述并显式维护操作。

```bash
npm run typecheck
npm run build
node examples/input-contracts.mjs
node examples/response-boundary.mjs
node scripts/export-openapi.mjs
npm run dev
```

input-contracts 对照额外字段、缺失／null、转换与 Unicode 长度。response-boundary 输出四个公开字段（含可空意图），故意制造的输出失约返回 500，已保存记录仍为 1；httpFailure 只负责转换，不自行打印异常；主线由 Filter 统一记录诊断。export-openapi 写入 dist/openapi.json；重新 build 会清理该文件，需要再次导出。

在浏览器打开 `http://127.0.0.1:3000/docs`，通过 Try it out 创建原文、提交非法字段、查询记录。该页面会发出真实请求，重复 POST 会创建多条记录。文档和 Swagger UI 资源由本服务提供，`/openapi.json` 可单独读取；不是自动生成所有业务约束，UTF-16 限额等自定义条件仍需核对描述和运行结果。

日常继续使用导入的 Postman 集合：“04 原文类型错误”和“07 详情不存在”可直接发送。查询错误可复制列表请求，在 Params 中添加 limit=01；方法错误可复制列表请求，将方法改成 DELETE。下面保留对应的终端复现。需要根据当前契约扩充集合时，保持 dev，在另一个终端构建并导出 OpenAPI 后，在 Postman 的 Import 中选择 `dist/openapi.json`，导出只使用 dist，不会清理开发产物。

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":7}'
curl -i 'http://127.0.0.1:3000/captures?limit=01'
curl -i http://127.0.0.1:3000/captures/missing
curl -i -X DELETE http://127.0.0.1:3000/captures
curl -s http://127.0.0.1:3000/openapi.json
```

前两项为 VALIDATION_ERROR，详情不存在为 CAPTURE_NOT_FOUND，不支持的方法为 METHOD_NOT_ALLOWED 并保留 Allow。未知请求字段仍忽略，id／createdAt 继续由服务端生成，原文空格和 UTF-16 长度规则不变，第十九章另拒绝 NUL 与孤立代理项。业务规则仍由 Service 维护；独立示例只展示各自的机制，不等同主线新协议。第十二章已将这些边界接到 Nest 请求机制，错误约定继续保持。


## 第十二章请求机制与独立顺序实验

主线默认 `npm run dev`，继续使用 [基础请求集合](requests/epp.postman_collection.json)。在 schema.pipe.ts 的 transform、Controller、response-schema.interceptor.ts 的 map 和 problem.filter.ts 的 catch 设置断点，分别发送字段类型错误、JSON 格式错误和正常创建，比较哪些位置会执行。输入失败为 400，输出失约为 500；输出失败不撤回已经完成的写入，失败响应会移除成功专用的 Location。

生产构建使用 `tsconfig.build.json`，在相同编译规则下排除 src/labs，clean 清除旧交付目录中的文件。typecheck 和开发监听仍覆盖全部 src；业务模块不导入实验模块。构建交付前检查 dist/src 不包含 labs。

独立实验不挂到主线 AppModule。先停止主线 dev，再执行：

```bash
npm run dev:pipeline
```

导入 [请求顺序实验集合](requests/pipeline.postman_collection.json)，目标为 `http://127.0.0.1:3006/pipeline`。VS Code 继续选择 `EPP: attach to npm run dev`，调试端口 9229 不变。修改 src/labs 下的代码会重新编译、重启；这两个开发命令共享 .dev 和 9229，不同时运行；build/test 使用 dist，可以与一个开发进程并行。

集合的九条请求依次展示正常经过、Middleware 失败、Guard 拒绝、Pipe 拒绝、Handler 抛错、输出失约、错误恢复、短路以及局部过滤器接手。演示头仅控制实验分支，不是身份认证。正常与恢复／短路结果为 201，三个早期失败分别为 400、403、400，Handler 与输出失败为 500，局部过滤器请求为 409；对照终端阶段与断点，观察哪一层没有执行。恢复与短路不意味着原来的输入或业务已经成功。

不需要端口的 Observable 实验：

```bash
node examples/observable-boundaries.mjs
```

它展示重复订阅执行两次、错误恢复成普通值、等待超时后底层工作继续完成。程序不依赖 dist，也不要求启动服务。

数据库测试使用单独的连接配置。首次将 [test/database.env.example](test/database.env.example) 复制为根目录 `.env.test`，填写隔离校验库的 `TEST_DATABASE_URL`，保持 `DB_QUERY_DEBUG=false`；已有文件只补所需字段，不覆盖。这个库须已应用本章迁移并含固定开发用户，可以使用第十八章建立的独立 VERIFY，不能使用 DEV 或需要保留业务数据的共享库。测试不会自动建库、迁移或清库。

`npm test` 只加载 `.env.test`，不读取开发 `.env`。测试入口要求显式的 `TEST_DATABASE_URL`，并用它替换测试进程中的 `DATABASE_URL`；仅设置 `NODE_ENV=test` 不会隔离数据库。进程已有的同名变量仍优先于文件，使用文件前先清除本终端旧的 `TEST_DATABASE_URL`、`DB_QUERY_DEBUG` 和 `DOCS_ENABLED`，再核对目标库。连接凭据不提交、不打印。

```bash
unset TEST_DATABASE_URL DB_QUERY_DEBUG DOCS_ENABLED
npm test
```

命令先构建，再以 NODE_ENV=test 运行本章全部 `test/*.test.mjs`，默认关闭文档。本章的写入回归会临时添加 CHECK 约束，再验证失败回滚与并发行为。表达可被多个来源复用，测试使用独立样本；清理保留测试前已有表达，只删除本次新增且已无来源引用的表达，整段清理在事务内完成。运行时暂停该校验库的其他写入；测试的随机 HTTP 端口只隔离应用监听，不隔离数据库。构建后源码未变时，可用 `NODE_ENV=test node --env-file-if-exists=.env.test --test test/captures.test.mjs` 单独运行非法 JSON 回归，仍须显式配置测试连接。正常学习继续使用 Postman 和调试器，日常开发仍使用 `.env` 与 `npm run dev`。


## 本机配置与交付核对

第三章起可将 `.env.example` 复制为 `.env`，填写开发 PORT。dev/debug 通过 Node 的 --env-file-if-exists 加载它，已存在的进程环境变量优先；NODE_ENV 由对应脚本明确指定。`.env` 不进入版本控制或交付目录，生产进程由启动环境提供 CURSOR_HMAC_KEY、PORT 等配置，npm start 不自动读取开发文件。修改 .env 后手动重新启动 dev；复制示例不会自动改变已经运行的进程。

`npm run check` 是本章的静态检查入口。检查代码后，仍需用已保存的 Postman 请求核对合法创建、错误拒绝、列表与详情；静态检查不能证明 HTTP 可用。生产模式核对请使用另外的端口和请求集合副本，避免把请求发到开发进程。采用第五章构建布局后，在独立运行目录执行 npm ci --omit=dev，再用 PORT=3001 npm start 启动产物，Postman 中将该集合副本的 baseUrl 设为 http://127.0.0.1:3001；核对依赖、配置、正常与失败响应，最后停止该进程。


第十一章起，Swagger 在 development 默认开启，在 test/production 默认关闭。NODE_ENV 只接受 development/test/production；DOCS_ENABLED 只接受 true/false，非法值在创建应用前失败。确需开启文档时由目标环境显式提供 DOCS_ENABLED=true；开放文档是一项有意的入口配置，不代表已有访问权限控制。生产关闭时 /docs 和 /openapi.json 返回路由不存在，业务接口照常可用；静态契约仍可用 scripts/export-openapi.mjs 导出。


## 第十三章配置、日志与关闭

从第十二章跟做时，按[三个可运行阶段](examples/chapter-13-stages/README.md)推进：配置解析 → 请求日志 → 关闭协调。每段均先 check 再观察行为，可以暂停恢复；补丁用于独立第十二章目录，不覆盖自己的实现。

本机 .env 可新增 LOG_LEVEL=debug、SHUTDOWN_TIMEOUT_MS=5000；已有 .env 不要直接覆盖。NODE_ENV 与文档开关由 src/config.ts 集中解析，src/http-options.ts 不再使用。PORT 和关闭期限先校验十进制表示；关闭期限为1～30000毫秒。配置无效时在创建应用前记录 CONFIG_INVALID 和字段名，返回非零退出码，不打印原值。APP_CONFIG 注入不可变配置快照；启动后改环境需重启。

Postman 发送已有请求后，在响应 Headers 复制 X-Request-Id，在本机日志中搜索同一编号。开发时保存输出：

```bash
mkdir -p logs
LOG_LEVEL=debug npm run dev 2>&1 | tee logs/dev.log
```

应用 JSON 的 message.event 是事件名，message.requestId 是编号；有编号的请求可关联 http.started、store.completed/failed 与 http.completed/aborted/failed。非法 JSON 或字段错误不应出现 insert 成功。可用 `node examples/filter-logs.mjs <实际编号> < logs/dev.log` 精确筛选；将尖括号占位符整体换掉。日志含编译器的非 JSON 行时脚本会跳过，不把原文作为检索身份。

生产目录继续 `PORT=3001 npm start`；先观察 app.ready，再用产物请求集合核对四个业务接口、失败输入、X-Request-Id 和默认关闭的文档。结束时 SIGINT/SIGTERM 只触发一次关闭；等 app.stopped 后确认子进程退出。默认五秒期限覆盖正在处理的存储操作与资源关闭；超时记录 app.stop_timeout 并失败退出，不保证最后响应或日志送达，不等于回滚。开发 runner 给出35秒兜底，确保不早于应用允许的最大期限。

资源实验与业务应用隔离。停止其他开发入口，执行：

```bash
npm run dev:lifecycle
```

导入 [生命周期实验集合](requests/lifecycle.postman_collection.json)，固定目标3007。选择“01 正常收尾”，Send 后向 app.ready 中的服务子进程 pid 发 SIGTERM，观察 resource.used → HTTP完成 → resource.closed → app.stopped。再次启动后取消正在执行的请求，http.aborted 后工作仍可能完成；已追踪工作在释放资源前结束。“02”返回500；“03”处理中停止会触发默认五秒期限，不能假定获得503响应。父 watcher 不等于服务子进程；子进程退出后父进程仍等待修改。

停止父 watcher 后，分别用 `LAB_MODE=init-fail npm run dev:lifecycle` 与 `LAB_MODE=close-hang npm run dev:lifecycle` 观察部分初始化清理及关闭挂起。前者没有 app.ready，后者在关闭期限到达后失败退出。强制结束可能留下本实验的临时目录；确认进程结束后，检查系统临时目录的 epp-lifecycle-*，只清理准确识别的实验路径，不用宽泛通配删除。最终恢复 normal 并切回主线 dev。

普通独立示例不需要端口：

```bash
node examples/lifecycle-order.mjs
node examples/request-context.mjs
```

前者观察初始化与关闭钩子；后者对照全局变量串值、AsyncLocalStorage 与事件绑定。第十章直接消费 CapturesModule 的示例已在自身根模块登记 RuntimeModule，容器之间不共享 global 模块。主服务使用数据库；独立生命周期实验仍只管理自己的文件资源，不连接数据库。build 排除全部 src/labs；dev:lifecycle 与 dev:pipeline 都只运行 .dev 产物。

## 第十四章综合实践（在第十四章快照进行）

先独立完成需求，再对照参考：新建 originalText 上限收紧为 1200 个 UTF-16 代码单元，旧记录仍可按原有 2000 单元范围读取；用数组替换 Map，同时保留 CAPTURE_STORE、观测包装、顺序、副本与失败约定。练习使用 `part-02/chapter-14` 快照；不要在本章持久化分支套用旧 Map／数组补丁。

停止已有 dev，保留原项目；无论自己跟写还是使用配套代码，都另建本章资料目录：

```bash
git clone --single-branch --branch part-02/chapter-14 \
  https://github.com/SamChowRock/epp-book-code.git ../epp-chapter-14-materials
```

克隆成功后继续；失败或目录已存在时先处理原因，不继续下一条。已有练习按下文恢复，不重新应用补丁。

```bash
cd ../epp-chapter-14-materials
review_root=$(pwd)
git fetch origin refs/heads/part-02/chapter-13:refs/remotes/origin/part-02/chapter-13
git worktree add -b practice/chapter-14 ../epp-chapter-14-practice origin/part-02/chapter-13
```

确认创建成功后进入目录，按第十四章实现自己的版本；已存在的目录或分支应保留，换新名称。review_root 只保存在当前 shell，后面仍使用这个终端回到原目录。

```bash
cd ../epp-chapter-14-practice
nvm use
npm ci
npm run check
PORT=3008 LOG_LEVEL=debug npm run dev
```

用 VS Code 打开练习目录并 attach。业务端口为 3008，Inspector 仍为 9229，不能与另一份 dev 同时启动。保存后自动编译重启，内存清空；比较失败前后的记录数量时，先建立当前进程的基线。

从第十四章资料目录导入 [requests/review.postman_collection.json](requests/review.postman_collection.json)，集合默认 baseUrl 为 `http://127.0.0.1:3008`。逐条 Send：普通输入、1200 单元、600 个表情成功；1201 单元、601 个表情及纯空白返回400且不写入。普通输入的首尾空格保留。成功响应 id 手动填入集合 captureId，核对详情、Location 与 X-Request-Id。集合不自动发请求；第十三章基线本身仍允许 1201 单元。

需运行参考时，保留自己的实现，在另一个 worktree 使用 [examples/chapter-14-review.patch](examples/chapter-14-review.patch)：

```bash
cd "$review_root"
git worktree add -b practice/chapter-14-reference ../epp-chapter-14-reference origin/part-02/chapter-13
```

创建成功后进入目录，只有补丁检查成功才应用；失败先检查基线和已有修改。

```bash
cd ../epp-chapter-14-reference
git apply --check "$review_root/examples/chapter-14-review.patch" &&
git apply "$review_root/examples/chapter-14-review.patch"
nvm use
npm ci
npm run check
node examples/review-contract.mjs
PORT=3008 LOG_LEVEL=debug npm run dev
```

启动前停止另一份 dev。独立示例直接放入 1500 单元旧记录，验证仍能投影为公开响应；两种存储都应保留副本，拒绝新建 1201 单元，筛选后再取 limit。这个进程的数据不进入 dev 服务；直接插入只用于受控旧数据条件，不是迁移或跳过校验的业务接口。

正文继续用两次可恢复故障区分写入前失败与输出失约；恢复源码后再构建交付。关闭对照复用 `npm run dev:lifecycle` 和生命周期集合，勿与业务 dev 同时运行。生产产物按前文所述文件布局在独立目录运行时，将端口改为 3009，复制练习集合并设置该目标，重新创建数据；`npm start` 使用 production、不加载开发 .env、不启用 Inspector，文档默认关闭。数组仍不持久化，停止后重新启动应为空。

本章的独立产物步骤与前面的生产运行说明使用相同文件布局；以第十四章正文的 3009 命令为准。退出并保存成果后再管理 worktree，不强制清除未提交实现。
