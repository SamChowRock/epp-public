# EPP 配套实践代码

当前对应第一篇第 5 章，代码分支 `part-01/chapter-05`，从第 4 章的 `part-01/chapter-04` 继续演进。服务迁入 TypeScript，建立检查、开发运行与编译产物运行入口；原有三个接口与启动配置继续沿用。记录保存在单个进程的 `Map` 中，停止进程后丢失；当前仅供本机实践。

使用 nvm 管理 Node.js；安装方式见 [nvm 官方说明](https://github.com/nvm-sh/nvm#installing-and-updating)。macOS、Linux 使用 Bash 或 Zsh，Windows 使用 WSL。在项目根目录运行：

```bash
nvm install
nvm use
node --version
npm ci
npm run typecheck
npm run build
npm start
```

`.nvmrc` 固定 Node.js 为 `24.22.1`，`node --version` 应输出 `v24.22.1`。`nvm install` 按文件安装并切换版本；每次新开终端后，在项目内执行 `nvm use`。单独进入目录不会自动切换版本。

`package.json` 中的 `engines.node` 同样声明精确版本，`.npmrc` 开启 `engine-strict`，让 npm 安装时拒绝不匹配的 Node 版本。遇到 `EBADENGINE` 先执行 `nvm use`，再重试安装。

本章固定开发依赖 TypeScript `5.9.3`、tsx `4.23.15`、`@types/node` `24.13.3`，没有第三方运行依赖。`npm ci` 按锁文件安装开发工具；`npm run build` 先清理 `dist/`，编译业务源码，再复制默认配置；`npm start` 只运行产物。服务默认监听 `http://127.0.0.1:3000`。默认端口来自 `config/service.json`，启动时由 `src/config.ts`（产物为 `dist/src/config.js`）相对于模块读取，不依赖调用者的工作目录。

可以为一次启动覆盖端口：

```bash
PORT=3001 node --enable-source-maps dist/src/server.js
```

`PORT` 必须为十进制数字字符串，转换后的整数范围是 1～65535；缺失时使用默认端口，空值或错误值会在监听前退出并返回非零状态。即使指定 `PORT`，默认配置文件仍必须存在且有效。配置仅在启动时读取；修改源码默认配置后需重新构建，修改运行目录的默认配置后需重启；绑定地址始终为 `127.0.0.1`。改端口后同步修改请求地址。

```bash
curl -i http://127.0.0.1:3000/captures
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"I am not much of cook."}'
```

创建成功返回 `201`，复制响应中的 `id`，用 `GET /captures/<id>` 查看详情。列表返回 `{ "items": [...] }`。同一正文重复提交会创建两条记录。

原文必须是非空白字符串，至多 2000 个 JavaScript UTF-16 代码单元；保留原始空格。请求体限制为 16 KiB。错误通过 HTTP 状态码与 `{ "error": "..." }` 返回：无效输入 `400`、不存在 `404`、方法不支持 `405`、请求体过大 `413`、内容类型不支持 `415`。

先构建，再运行 `npm run debug`，在 Chrome 的 `chrome://inspect` 中打开 Node 调试目标，继续启动后，在 `captures.set(capture.id, capture)` 设置断点并再次发送创建请求。调试器仅监听本机 `9229` 端口。停止时，在运行服务的终端按 `Ctrl+C`。

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

从 `src/` 运行错误示例应出现 `ENOENT`，而服务使用模块相对配置，可从这个目录直接启动：

```bash
(
  cd src
  node ../examples/cwd-config.js
  PORT=3001 node --import=tsx server.ts
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


## 第五章类型、模块与构建

开发入口与产物入口分别运行，不要同时占用默认端口：

```bash
npm run dev
```

该命令以 tsx watch 执行 `src/server.ts`；重新启动会清空内存记录，不做完整类型检查。停止后单独执行 `npm run typecheck`、`npm run build`，再 `npm start`。构建产物保留 `dist/src/` 与 `dist/config/` 的相对关系，默认配置是构建时复制的快照。

仅查看开发源码配置，也可执行 `node --import=tsx` 加载入口；不要把 `node src/server.ts` 当成 tsx 的通用替代，本项目源码以 `.js` 导入匹配最终产物。

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
