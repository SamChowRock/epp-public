# EPP 配套实践代码

本章检出命令为 `git switch part-01/chapter-05`。命令、迁移目录和请求集合沿用项目中的实际文件名。

当前对应第一篇第 5 章，代码分支 `part-01/chapter-05`，从第 4 章的 `part-01/chapter-04` 继续演进。第五章加入事件循环、取消、线程池和 Worker 观察程序，沿用第四章的启动配置与原有三个 HTTP 接口。数据保存在单个进程的 `Map` 中，停止进程后丢失；当前仅供本机实践。

使用 nvm 管理 Node.js；安装方式见 [nvm 官方说明](https://github.com/nvm-sh/nvm#installing-and-updating)。macOS、Linux 使用 Bash 或 Zsh，Windows 使用 WSL。在项目根目录运行：

```bash
nvm install
nvm use
node --version
npm ci
npm run dev
```

`.nvmrc` 固定 Node.js 为 `24.22.1`，`node --version` 应输出 `v24.22.1`。`nvm install` 按文件安装并切换版本；每次新开终端后，在项目内执行 `nvm use`。单独进入目录不会自动切换版本。

`package.json` 中的 `engines.node` 同样声明精确版本，`.npmrc` 开启 `engine-strict`，让 npm 安装时拒绝不匹配的 Node 版本。遇到 `EBADENGINE` 先执行 `nvm use`，再重试安装。

本章没有第三方依赖。`npm ci` 用于核对依赖清单与锁文件；服务默认监听 `http://127.0.0.1:3000`。默认端口来自 `config/service.json`，启动时由 `src/config.js` 相对于模块读取，不依赖调用者的工作目录。

可以为一次启动覆盖端口：

```bash
NODE_ENV=production PORT=3001 node src/server.js
```

`PORT` 必须为十进制数字字符串，转换后的整数范围是 1～65535；缺失时使用默认端口，空值或错误值会在监听前退出并返回非零状态。即使指定 `PORT`，默认配置文件仍必须存在且有效。配置仅在启动时读取，修改后重启；绑定地址始终为 `127.0.0.1`。改端口后同步修改请求地址。

## 用 Postman 发送和保存请求

保持 `npm run dev` 运行。在 [Postman 桌面客户端](https://www.postman.com/downloads/) 中选择 **Import**，导入 [requests/epp.postman_collection.json](requests/epp.postman_collection.json)，打开“EPP 本机接口调试”集合。已有同类客户端也可以按相同方法、地址、头部和正文创建请求。

1. 打开“01 查看列表”，点击 **Send**，查看响应状态、Body 和 Headers。新进程应返回 200 与空的 items。
2. 打开“02 创建原文”，在 **Body → raw → JSON** 修改 originalText，点击 Send，查看 201、返回的 id 和响应头 Location。
3. 将实际 id 填入集合 **Variables** 的 captureId，再发送“03 查看详情”，应返回 200。baseUrl 默认是 `http://127.0.0.1:3000`；改端口时一起修改，发送前核对变量解析后的实际 URL。所选环境中的同名变量可能覆盖集合变量。
4. 集合还保存了字段类型错误、JSON 格式错误、内容类型错误与详情不存在的输入，分别观察 400、400、415、404，再查看列表确认失败没有新增记录。各章错误正文以当前实现为准。

需要修改请求时，在 Headers、Body 或 Params 中编辑，保存后可反复点击 Send；查询条件由 Params 处理 URL 编码，第九章起再使用 q／limit。保存源码后等待服务自动重启，再点 Send 查看新响应；重启会清空 Map，需要重新创建记录并更新 captureId。每次 POST 都可能新增记录，集合保存的是请求，不会自动发送或保留服务数据。

调试时保持同一个请求，在源码中设置断点后点击 Send。暂停期间客户端会等待；继续执行后才会收到响应。第六章起可用 VS Code 的 `EPP: attach to npm run dev` 自动重连，前面章节通过 Chrome 的 `chrome://inspect` 连接；重启后若连接断开，重新选择目标。生产运行方式见文末，日常学习保持 dev 模式。

下面的 curl 是同一请求的终端表示，用于复制复现；日常可直接使用集合里的请求。

```bash
curl -i http://127.0.0.1:3000/captures
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"I am not much of cook."}'
```

创建成功返回 `201`，复制响应中的 `id`，用 `GET /captures/<id>` 查看详情。列表返回 `{ "items": [...] }`。同一正文重复提交会创建两条记录。

原文必须是非空白字符串，至多 2000 个 JavaScript UTF-16 代码单元；保留原始空格。请求体限制为 16 KiB。错误通过 HTTP 状态码与 `{ "error": "..." }` 返回：无效输入 `400`、不存在 `404`、方法不支持 `405`、请求体过大 `413`、内容类型不支持 `415`。

保持 `npm run dev` 运行，在 Chrome 的 `chrome://inspect` 中打开 Node 调试目标，连接后，在 `captures.set(capture.id, capture)` 设置断点并再次发送创建请求。调试器仅监听本机 `9229` 端口。停止时，在运行服务的终端按 `Ctrl+C`。

本章不包含数据库、登录、AI、分页、CORS 配置和生产部署。保留 Node 对 `SIGINT`／`SIGTERM` 的默认处理，未实现优雅关闭流程。完整原理与操作步骤见 [EPP 后端开发实践](https://github.com/SamChowRock/EPP-Book)。

第三章支线“从字节到 JSON”另有独立示例。在项目根目录执行：

```bash
nvm use
node examples/buffer-boundary.js
```

示例主动切开一个 UTF-8 字符，对照逐块解码、合并后解码和 `StringDecoder` 的输出；无需启动 HTTP 服务。

## 第四章运行环境示例

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

从 `src/` 运行错误示例应出现 `ENOENT`，而服务使用模块相对配置，可从这个目录直接启动：

```bash
(
  cd src
  node ../examples/cwd-config.js
  NODE_ENV=production PORT=3001 node server.js
)
```

也可以只读取配置，不启动服务。在项目根目录执行：

```bash
node --input-type=module -e 'import { loadConfig } from "./src/config.js"; console.log(await loadConfig());'
NODE_ENV=production PORT=3001oops node src/server.js
echo $?
```

最后一次启动应输出配置错误，退出码为 `1`。默认文件损坏、字段类型错误或文件缺失也会在监听前拒绝启动。`npm start` 会在包根目录运行脚本，观察 cwd 差异时使用上面的直接 `node` 命令。

## 第四章知识支线与路径变式

正文的 `path-report.js` 只展示路径解析，不读写传入文件：

```bash
node examples/path-report.js ./input.json
(
  cd src
  node ../examples/path-report.js ./input.json
)
```

两次输出的模块配置位置相同，用户输入与导出目录随 cwd 改变。输出包含本机路径，分享前检查个人信息。

支线 4A 使用 `stdio-result.js` 将一份 JSON 输出到 stdout，将诊断说明输出到 stderr；配合 `echo-stdin.js` 观察重定向与管道。正文给出了 `2>&1` 顺序与 `pipefail` 的对照，不要把两路输出混合后的内容当成合法 JSON。

支线 4B 的示例只修改自己创建的临时目录，结束时自动清理：

```bash
node examples/file-permissions.js
node examples/file-handle.js
node examples/file-handle.js --fail
echo $?
```

权限示例按普通账号、POSIX 常规文件权限解释；管理员权限、ACL、沙箱和挂载方式可能改变结果。句柄示例的 `--fail` 路径刻意在写入后抛错，应返回 1，但仍执行关闭，并在清理之前重新读到已写内容。关闭资源不回滚写入。

支线 4C 用短定时任务比较两种停止策略，无需 HTTP 端口：

```bash
node examples/signal-lifetime.js log-only
node examples/signal-lifetime.js drain
```

每次看到 `ready` 和工作开始后，在该终端按 `Ctrl+C`。`log-only` 只记录信号，仍会继续开始新工作，十秒演示时限会停止调度并返回失败；`drain` 停止调度，等待已接受工作完成，清理剩余定时器后自然退出。按顺序分别完成两次观察，不需要同时运行。这个有限任务示例用于解释资源与工作归属，不替代服务的 HTTP／数据库生命周期实现。

## 第五章事件循环与执行边界示例

继续从项目根目录运行，沿用 Node.js `24.22.1`，不新增第三方依赖。`src/` 的记录接口保持第四章行为，以下实验不增加业务路由。

先在一个终端运行 `PORT=3000 npm run dev`；在 Postman 保留主线集合的列表请求，另一个终端用慢速上传与独立 GET 观察请求重叠。下面的 curl 用于控制并发时序；日常查看结果仍可点击列表请求的 Send：

```bash
node examples/slow-upload.js &
upload_pid=$!
sleep 0.2
curl -sS -w '\nlist total=%{time_total}s\n' http://127.0.0.1:3000/captures
wait "$upload_pid"
curl -sS http://127.0.0.1:3000/captures
```

先确认服务已收到 POST、上传尚未完成：第5章快照的服务日志输出 JSON，其中 event 为 http.request、method 为 POST；后续章节日志格式演进后，按对应章的入口事件核对。期间列表仍应能返回；之后列表增加本次原文。改服务端口时同步改客户端与 curl 地址。重复运行会创建新记录。

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

支线 5A 的顺序与有限饥饿实验：

```bash
node examples/scheduling-order.js
node examples/scheduling-order.js --starve
```

分别比较 ESM 顶层与 I/O 回调中的 nextTick／微任务顺序，以及 `--starve` 对定时器和 I/O 回调的延后。

支线 5B 的一次性线程协议：

```bash
node examples/worker-boundary.js main
node examples/worker-boundary.js worker
node examples/worker-boundary.js fail
node examples/worker-boundary.js empty
node examples/worker-boundary.js timeout
```

main 与 worker 对照父线程探针和计算完成的先后；后者修改输入副本，父线程的 note 保持不变。fail、empty、timeout 分别报告异常、无结果退出与期限终止，并返回 1。完整示例同时等待结果和退出，只处理无外部副作用的计算，不代替持久化后台任务或生产线程池。

## 开发与生产运行

运行模式由命令明确提供：`npm run dev` 和 `npm run debug` 使用 development，`npm start` 使用 production。NODE_ENV 决定库与应用的环境行为，文件监听和 Inspector 则由命令参数分别控制；更改模式要重新启动进程。请用开发进程修改代码，用独立的交付运行核对实际产物，不把本机调试服务当作生产进程。

请求日志只记录方法，不写原始 URL、查询值、请求正文或凭据。需要核对输入时，在 Postman 中查看自己发送的请求，并在调试器中观察变量；内部失败日志只记录异常类型，避免错误消息或堆栈带出数据。后续请求关联和结构化诊断在相应章节继续建立。

学习和日常修改默认使用 `npm run dev`：监听源码变化、自动重启，并在 `127.0.0.1:9229` 开启 Inspector。通过 Chrome 的 chrome://inspect 连接，修改保存后重新发送请求；重启会清空 Map，浏览器页面不会自动刷新。若调试连接断开，重新连接新进程。`npm run debug` 保留给需要在启动第一行暂停的排查。

生产运行使用 `npm start`，不监听文件，也不开启调试端口。开发与生产执行同一服务代码；不要同时启动两份服务争用业务端口。Node 原生 watch 追踪入口及导入模块，修改运行配置或依赖后手动重启开发命令；本阶段没有构建步骤。生产部署中的进程托管、HTTPS与恢复在部署篇继续展开。


## 本机配置与交付核对

第四章起可将 `.env.example` 复制为 `.env`，填写开发 PORT。dev/debug 通过 Node 的 --env-file-if-exists 加载它，已存在的进程环境变量优先；NODE_ENV 由对应脚本明确指定。`.env` 不进入版本控制或交付目录，生产进程由启动环境提供 PORT 等配置，npm start 不自动读取开发文件。修改 .env 后手动重新启动 dev；复制示例不会自动改变已经运行的进程。

`npm run check` 是本章的静态检查入口。检查代码后，仍需用已保存的 Postman 请求核对合法创建、错误拒绝、列表与详情；静态检查不能证明 HTTP 可用。生产模式核对请使用另外的端口和请求集合副本，避免把请求发到开发进程。采用第六章构建布局后，在独立运行目录执行 npm ci --omit=dev，再用 PORT=3001 npm start 启动产物，Postman 中将该集合副本的 baseUrl 设为 http://127.0.0.1:3001；核对依赖、配置、正常与失败响应，最后停止该进程。
