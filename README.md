# EPP 配套实践代码

当前对应第二篇第 9 章，代码分支 `part-02/chapter-09`，从 `part-02/chapter-08` 继续演进。Service 通过构造参数接收 CaptureStore，Map 移入 MemoryCaptureStore，由 Nest 的 CAPTURE_STORE 令牌与 Service 工厂组装。存储操作统一返回 Promise，HTTP 行为和 q／limit 规则保持；记录仍只保存在当前进程内存，停止进程后丢失，仅供本机实践。

使用 nvm 管理 Node.js；安装方式见 [nvm 官方说明](https://github.com/nvm-sh/nvm#installing-and-updating)。macOS、Linux 使用 Bash 或 Zsh，Windows 使用 WSL。在项目根目录运行：

```bash
nvm install
nvm use
node --version
npm ci
npm run typecheck
npm run build
npm run dev
```

`.nvmrc` 固定 Node.js 为 `24.22.1`，`node --version` 应输出 `v24.22.1`。`nvm install` 按文件安装并切换版本；每次新开终端后，在项目内执行 `nvm use`。单独进入目录不会自动切换版本。

`package.json` 中的 `engines.node` 同样声明精确版本，`.npmrc` 开启 `engine-strict`，让 npm 安装时拒绝不匹配的 Node 版本。遇到 `EBADENGINE` 先执行 `nvm use`，再重试安装。

本章运行依赖为 Nest `11.2.5`（common、core、platform-express）、reflect-metadata `0.2.2` 与 rxjs `7.8.2`；沿用的独立支线示例显式依赖 Express `5.2.1`，适配器也使用 Express 5，overrides 固定其间接依赖 Multer `2.5.0`。开发依赖保留 TypeScript `5.9.3`、tsx `4.23.15`、`@types/node` `24.13.3`，以及 `@types/express` `5.0.6`。`npm ci` 按锁文件安装完整依赖；`npm run build` 先清理 `dist/`，编译业务源码，再复制默认配置；`npm start` 只运行产物。服务默认监听 `http://127.0.0.1:3000`。默认端口来自 `config/service.json`，启动时由 `src/config.ts`（产物为 `dist/src/config.js`）相对于模块读取，不依赖调用者的工作目录。

可以为一次启动覆盖端口：

```bash
PORT=3001 node --enable-source-maps dist/src/server.js
```

`PORT` 必须为十进制数字字符串，转换后的整数范围是 1～65535；缺失时使用默认端口，空值或错误值会在监听前退出并返回非零状态。即使指定 `PORT`，默认配置文件仍必须存在且有效。配置仅在启动时读取；修改源码默认配置后需重新构建，修改运行目录的默认配置后需重启；绑定地址始终为 `127.0.0.1`。改端口后同步修改请求地址。

## 用 Postman 发送和保存请求

保持 `npm run dev` 运行。在 [Postman 桌面客户端](https://www.postman.com/downloads/) 中选择 **Import**，导入 [requests/epp.postman_collection.json](requests/epp.postman_collection.json)，打开“EPP 本机接口调试”集合。已有同类客户端也可以按相同方法、地址、头部和正文创建请求。

1. 打开“01 查看列表”，点击 **Send**，查看响应状态、Body 和 Headers。新进程应返回 200 与空的 items。
2. 打开“02 创建原文”，在 **Body → raw → JSON** 修改 originalText，点击 Send，查看 201、返回的 id 和响应头 Location。
3. 将实际 id 填入集合 **Variables** 的 captureId，再发送“03 查看详情”，应返回 200。baseUrl 默认是 `http://127.0.0.1:3000`；改端口时一起修改，发送前核对变量解析后的实际 URL。所选环境中的同名变量可能覆盖集合变量。
4. 集合还保存了字段类型错误、JSON 格式错误、内容类型错误与详情不存在的输入，分别观察 400、400、415、404，再查看列表确认失败没有新增记录。各章错误正文以当前实现为准。

需要修改请求时，在 Headers、Body 或 Params 中编辑，保存后可反复点击 Send；查询条件由 Params 处理 URL 编码，第八章起再使用 q／limit。保存源码后等待服务自动重启，再点 Send 查看新响应；重启会清空 Map，需要重新创建记录并更新 captureId。每次 POST 都可能新增记录，集合保存的是请求，不会自动发送或保留服务数据。

调试时保持同一个请求，在源码中设置断点后点击 Send。暂停期间客户端会等待；继续执行后才会收到响应。第五章起可用 VS Code 的 `EPP: attach to npm run dev` 自动重连，前面章节通过 Chrome 的 `chrome://inspect` 连接；重启后若连接断开，重新选择目标。生产运行方式见文末，日常学习保持 dev 模式。

下面的 curl 是同一请求的终端表示，用于复制复现；日常可直接使用集合里的请求。

```bash
curl -i http://127.0.0.1:3000/captures
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"I am not much of cook."}'
```

创建成功返回 `201`，复制响应中的 `id`，用 `GET /captures/<id>` 查看详情。列表返回 `{ "items": [...] }`。同一正文重复提交会创建两条记录。

原文必须是非空白字符串，至多 2000 个 JavaScript UTF-16 代码单元；保留原始空格。请求体限制为 16 KiB。错误通过 HTTP 状态码与 `{ "error": "..." }` 返回：无效输入 `400`、不存在 `404`、方法不支持 `405`、请求体过大 `413`、内容类型不支持 `415`。

保持 `npm run dev` 运行，在 Chrome 的 `chrome://inspect` 中打开 Node 调试目标，连接后，在 `src/captures.service.ts` 的 `await this.store.insert(capture)` 和 `src/memory-capture.store.ts` 的 Map 写入处设置断点并再次发送创建请求。调试器仅监听本机 `9229` 端口。停止时，在运行服务的终端按 `Ctrl+C`。

本章不包含数据库、登录、AI、分页、CORS 配置和生产部署。保留 Node 对 `SIGINT`／`SIGTERM` 的默认处理，未实现优雅关闭流程。完整原理与操作步骤见 [EPP 后端开发实践](https://github.com/SamChowRock/EPP-Book)。

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
  PORT=3001 node --enable-source-maps ../dist/src/server.js
)
```

也可以只读取配置，不启动服务。在项目根目录执行：

```bash
node --import=tsx --input-type=module -e 'import { loadConfig } from "./src/config.ts"; console.log(await loadConfig());'
PORT=3001oops node --enable-source-maps dist/src/server.js
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

先在一个终端按默认端口运行 `npm start`；另一个终端用慢速上传与独立 GET 观察请求重叠：

```bash
node examples/slow-upload.js &
upload_pid=$!
sleep 0.2
curl -sS -w '\nlist total=%{time_total}s\n' http://127.0.0.1:3000/captures
wait "$upload_pid"
curl -sS http://127.0.0.1:3000/captures
```

先确认服务已收到 POST、上传尚未完成，期间列表仍应能返回；之后列表增加本次原文。改服务端口时同步改客户端与 curl 地址。重复运行会创建新记录。

独立实验服务使用 `127.0.0.1:3002`：

```bash
node examples/event-loop-server.js
```

等待打印监听地址后，在另一个终端执行：

```bash
curl -sS -w '\nslow total=%{time_total}s\n' http://127.0.0.1:3002/wait &
slow_pid=$!
sleep 0.1
curl -sS -w '\nquick total=%{time_total}s\n' http://127.0.0.1:3002/quick
wait "$slow_pid"
```

把第一条 URL 的 `/wait` 分别换成 `/block`、`/slice`，每轮完成后再开始下一轮。对照快请求顺序与 curl 的总耗时，再看服务里的 100 ms 探针。`/wait` 是定时器等待；`/block` 连续计算约 600 ms；`/slice` 分段让事件循环推进，仍累计消耗约 600 ms 计算时间。实验只供本机短时观察，结束后在两个服务终端分别按 `Ctrl+C`。

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

第五章建立的 `npm run dev` 继续作为默认学习入口，使用同一 TypeScript 编译配置监听变化、自动重启，并开启本机调试端口；本章新增的装饰器元数据也由编译器生成。保存源码后重新发送请求，自动重启会清空内存记录。只检查类型用 `npm run typecheck`。构建产物保留 `dist/src/` 与 `dist/config/` 的相对关系，默认配置是构建时复制的快照。

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

完成服务构建后，在独立目录核对运行单元：

```bash
npm run build &&
release_dir=$(mktemp -d) &&
cp package.json package-lock.json .npmrc .nvmrc "$release_dir/" &&
cp -R dist "$release_dir/dist" &&
(
  cd "$release_dir" &&
  npm ci --omit=dev &&
  npm start
)
```

运行目录不含源码和开发工具，不支持重新构建。保留当前 shell 的 `release_dir`，停止服务后可从其他 cwd 使用绝对入口和 `PORT=3001` 再运行；配置仍从运行目录里的 `dist/config/` 读取。默认配置缺失应在监听前失败。按正文再次核对三个接口、错误输入与重启丢数，结束后只清理自己新建的临时目录。


## 第六章独立实践参考

`part-01/chapter-06` 的主服务保持第五章状态。`examples/chapter-06-source.patch` 保存可选来源标签的独立实现，供完成自主实践后对照；该字段不进入第七章及后续主线。

查看参考：`git show part-01/chapter-06:examples/chapter-06-source.patch`。需要运行参考时，从 `part-01/chapter-05` 另建干净的个人 worktree，在新目录执行 `git show part-01/chapter-06:examples/chapter-06-source.patch | git apply -`，然后执行 `nvm use`、`npm ci`、`npm run typecheck`、`npm run build`、`npm start`。不要在已有个人成果上直接应用补丁。详细需求、隔离步骤与响应观察见第六章。

## 第七章建立的 Nest 组装与业务边界

第七章先从职责变化比较手动组装与框架组织，再解释 Nest 的控制反转、依赖注入、模块封装与平台适配。独立示例在完成构建后运行：

```bash
node examples/manual-composition.mjs
```

`makeEntry` 通过普通函数参数接收 Service，两个入口共享同一实例时打印 `shared entry count: 1`。第九章新增 `another service, same store: 1`，说明不同 Service 可以共享同一存储；使用独立 MemoryCaptureStore 的入口打印 `isolated entry count: 0`。这只观察同一进程内的对象关系，不表示未来独立运行的 HTTP 与 CLI 进程共享 Map。

- `src/captures.service.ts`：原文规则、记录创建与查询；第九章接收 CaptureStore，不再直接持有 Map。
- `src/capture.ts`、`src/capture-store.ts`、`src/memory-capture.store.ts`：模型、存储契约与内存实现，复制写入与读取对象，保留查询语义。
- `src/captures.controller.ts`：三个 HTTP 入口；第八章改用 Nest 返回值响应，创建用 passthrough 设置 Location。
- `src/http.ts`：沿用流读取、16 KiB 限制与 JSON 输出，转换业务和协议失败。
- `src/http-boundary.ts`：路由前核对路径与允许方法，保留 404／405、Allow 和原始 ID 行为。
- `src/app.module.ts` 与 `src/app.ts`：注册组件、创建 Nest Express 应用，关闭默认解析器；第八章由 captureBody 在路由前唯一读取 JSON。
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
node examples/express-pipeline.js
```

独立监听 `127.0.0.1:3003`，没有修改 EPP 的三个业务接口。在另一终端逐条观察：

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

`src/capture-query.ts` 把单值查询转换为业务参数，`src/capture-body.ts` 负责 POST 的唯一 JSON 读取；`src/http.ts` 的 httpResult 将已知失败转成原有 HTTP 错误结构。三个 Controller 方法返回业务结果，创建时只设置 Location。成功响应的自动头部可能变化，业务状态、JSON 和 Location／Allow 约定继续保持。

```bash
curl -i 'http://127.0.0.1:3000/captures?q=coffee&limit=1'
curl -i 'http://127.0.0.1:3000/captures?limit=1&limit=2'
curl -i --get --data-urlencode 'q=C++ & Node' http://127.0.0.1:3000/captures
```

q 大小写敏感、按字面子串匹配，提供时非空白且最多 200 个 UTF-16 代码单元；limit 是 1～100 的十进制整数文本，不接受前导零、小数和指数。重复已知参数拒绝，未知字段忽略。先筛选，再按 Map 插入顺序截取；没有参数时仍返回全部记录，未增加分页或数据库。失败不改变已有记录。

支线 8A 无需服务端口：

```bash
node examples/url-inputs.mjs
```

观察加号与空格、get 与 getAll、百分号只解码一次，以及构造参数值后片段不进入请求目标。

支线 8B 单独编译并监听 3005；常规 build 会清理示例产物，之后需要重新编译：

```bash
npm exec -- tsc -p examples/controller-responses/tsconfig.json
node dist/examples/controller-responses/main.js
```

另一终端依次运行：

```bash
curl -i http://127.0.0.1:3005/responses/automatic
curl -i http://127.0.0.1:3005/responses/accepted -H 'Content-Type: application/json' --data '{"message":"hello"}'
curl -i http://127.0.0.1:3005/responses/manual
curl -i http://127.0.0.1:3005/responses/passthrough
curl --max-time 2 -i http://127.0.0.1:3005/responses/forgotten
```

依次为 200、202、200、200、客户端超时。passthrough 带 X-Example；forgotten 的方法返回并不触发自动发送。按支线先改为 passthrough，再改成手动 json，对照两种完成方式；每次停止、编译、启动后观察，最终恢复原示例。独立应用默认启用 Nest 的 JSON 解析器，与主线不同；临时关闭时 accepted 不再得到 body，观察后恢复。实验结束按 Ctrl+C 停止进程。

### 查询容量与条件读取

从第八章开始，业务入口在 simple 查询解析前拒绝超过 1000 个 `&` 分隔片段的查询（400），包括未知字段和空片段，避免尾部 q 或重复参数被静默丢弃。上限内的未知字段仍忽略。

自动响应会生成 ETag。GET 带匹配的 `If-None-Match`（或 `*`）时可能返回 304，没有响应体及 JSON Content-Type；客户端应复用已有缓存。不带条件或条件不匹配时返回 200 JSON。主线仍不开放 HEAD（405）。此行为从第八章起承接 Express 的条件响应语义，具体操作见支线 8B。


## 第九章存储契约与 Provider

- `capture-store.ts` 同时导出类型接口与唯一 Symbol 令牌，两者分别服务于静态检查与运行时查找。
- `MemoryCaptureStore` 实现异步契约，Map 仍是同步内存操作；存储副本、查询语义与不存在／故障区分由契约约定。
- AppModule 使用 useClass 提供存储，以 useFactory／inject 创建普通 CapturesService；Controller 在成功写入后设置 Location，列表先等待再包装。

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

## 开发与生产运行

运行模式由命令明确提供：`npm run dev` 和 `npm run debug` 使用 development，`npm start` 使用 production。NODE_ENV 决定库与应用的环境行为，文件监听和 Inspector 则由命令参数分别控制；更改模式要重新启动进程。请用开发进程修改代码，用独立的交付运行核对实际产物，不把本机调试服务当作生产进程。

请求日志只记录方法，不写原始 URL、查询值、请求正文或凭据。需要核对输入时，在 Postman 中查看自己发送的请求，并在调试器中观察变量；内部失败日志只记录异常类型，避免错误消息或堆栈带出数据。后续请求关联和结构化诊断在相应章节继续建立。

学习和日常修改默认使用 `npm run dev`。scripts/dev.mjs 使用项目锁定的 TypeScript watch 与 tsconfig.dev.json 编译到 .dev，成功后复制配置并启动开启本机 Inspector 的服务；保存源码、修改 tsconfig.json 或 config/service.json 后自动重启。类型错误时停止旧服务，修复保存后恢复；终端的 Build succeeded 只表示编译成功，还要看到服务监听日志。重启会清空 Map，浏览器页面不会自动刷新，需要重新发请求。

先在终端运行 dev，再在 VS Code 选择 `EPP: attach to npm run dev`；`restart: true` 会在服务重启后尝试重连，断点保留。Chrome 可从 chrome://inspect 连接，但重启后可能需要重新选择目标。只有排查启动第一行才使用 `npm run build` 和 `npm run debug`；dev与debug不要同时占用9229或业务端口。dev 使用 .dev，build/clean 使用 dist，二者不会相互清理；并行检查不会自动重启开发服务。dev 使用 .dev，build/clean 使用 dist，二者不会相互清理；并行检查不会自动重启开发服务。dev 使用 .dev，build/clean 使用 dist，二者不会相互清理；并行检查不会自动重启开发服务。dev 使用 .dev，build/clean 使用 dist，二者不会相互清理；并行检查不会自动重启开发服务。dev 使用 .dev，build/clean 使用 dist，二者不会相互清理；并行检查不会自动重启开发服务。依赖、package.json、开发脚本及环境变量改变后手动重启dev。此时的自动重启不保留进程内状态。

生产方式先 `npm ci`、`npm run build`，再按第五章准备运行目录，仅安装运行依赖（`npm ci --omit=dev`），执行 `npm start`。start只运行构建产物，不开启Inspector或文件监听；生产环境不运行dev/debug。配置已复制进dist，修改源配置不会自动更新生产产物。环境变量按部署目标提供；NODE_ENV=production本身不会替代构建或自动关闭调试。完整进程托管、HTTPS与发布恢复在部署篇展开。


## 本机配置与交付核对

第三章起可将 `.env.example` 复制为 `.env`，填写开发 PORT。dev/debug 通过 Node 的 --env-file-if-exists 加载它，已存在的进程环境变量优先；NODE_ENV 由对应脚本明确指定。`.env` 不进入版本控制或交付目录，生产进程由启动环境提供 PORT 等配置，npm start 不自动读取开发文件。修改 .env 后手动重新启动 dev；复制示例不会自动改变已经运行的进程。

`npm run check` 是本章的静态检查入口。检查代码后，仍需用已保存的 Postman 请求核对合法创建、错误拒绝、列表与详情；静态检查不能证明 HTTP 可用。生产模式核对请使用另外的端口和请求集合副本，避免把请求发到开发进程。采用第五章构建布局后，在独立运行目录执行 npm ci --omit=dev，再用 PORT=3001 npm start 启动产物，Postman 中将该集合副本的 baseUrl 设为 http://127.0.0.1:3001；核对依赖、配置、正常与失败响应，最后停止该进程。
