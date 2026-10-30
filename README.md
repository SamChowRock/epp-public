# EPP 配套实践代码

当前对应第一篇第 3 章，代码分支 `part-01/chapter-03`，从第 2 章的 `part-01/chapter-02` 继续演进。第三章加入端口配置与运行环境示例，保留原有三个 HTTP 接口。数据保存在单个进程的 `Map` 中，停止进程后丢失；当前仅供本机实践。

使用 nvm 管理 Node.js；安装方式见 [nvm 官方说明](https://github.com/nvm-sh/nvm#installing-and-updating)。macOS、Linux 使用 Bash 或 Zsh，Windows 使用 WSL。在项目根目录运行：

```bash
nvm install
nvm use
node --version
npm ci
npm start
```

`.nvmrc` 固定 Node.js 为 `24.22.1`，`node --version` 应输出 `v24.22.1`。`nvm install` 按文件安装并切换版本；每次新开终端后，在项目内执行 `nvm use`。单独进入目录不会自动切换版本。

`package.json` 中的 `engines.node` 同样声明精确版本，`.npmrc` 开启 `engine-strict`，让 npm 安装时拒绝不匹配的 Node 版本。遇到 `EBADENGINE` 先执行 `nvm use`，再重试安装。

本章没有第三方依赖。`npm ci` 用于核对依赖清单与锁文件；服务默认监听 `http://127.0.0.1:3000`。默认端口来自 `config/service.json`，启动时由 `src/config.js` 相对于模块读取，不依赖调用者的工作目录。

可以为一次启动覆盖端口：

```bash
PORT=3001 node src/server.js
```

`PORT` 必须为十进制数字字符串，转换后的整数范围是 1～65535；缺失时使用默认端口，空值或错误值会在监听前退出并返回非零状态。即使指定 `PORT`，默认配置文件仍必须存在且有效。配置仅在启动时读取，修改后重启；绑定地址始终为 `127.0.0.1`。改端口后同步修改请求地址。

```bash
curl -i http://127.0.0.1:3000/captures
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"I am not much of cook."}'
```

创建成功返回 `201`，复制响应中的 `id`，用 `GET /captures/<id>` 查看详情。列表返回 `{ "items": [...] }`。同一正文重复提交会创建两条记录。

原文必须是非空白字符串，至多 2000 个 JavaScript UTF-16 代码单元；保留原始空格。请求体限制为 16 KiB。错误通过 HTTP 状态码与 `{ "error": "..." }` 返回：无效输入 `400`、不存在 `404`、方法不支持 `405`、请求体过大 `413`、内容类型不支持 `415`。

运行 `npm run debug`，在 Chrome 的 `chrome://inspect` 中打开 Node 调试目标，继续启动后，在 `captures.set(capture.id, capture)` 设置断点并再次发送创建请求。调试器仅监听本机 `9229` 端口。停止时，在运行服务的终端按 `Ctrl+C`。

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
  PORT=3001 node server.js
)
```

也可以只读取配置，不启动服务。在项目根目录执行：

```bash
node --input-type=module -e 'import { loadConfig } from "./src/config.js"; console.log(await loadConfig());'
PORT=3001oops node src/server.js
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

## 开发与生产运行

学习和日常修改默认使用 `npm run dev`：监听源码变化、自动重启，并在 `127.0.0.1:9229` 开启 Inspector。通过 Chrome 的 chrome://inspect 连接，修改保存后重新发送请求；重启会清空 Map，浏览器页面不会自动刷新。若调试连接断开，重新连接新进程。`npm run debug` 保留给需要在启动第一行暂停的排查。

生产运行使用 `npm start`，不监听文件，也不开启调试端口。开发与生产执行同一服务代码；不要同时启动两份服务争用业务端口。Node 原生 watch 追踪入口及导入模块，修改运行配置或依赖后手动重启开发命令；本阶段没有构建步骤。生产部署中的进程托管、HTTPS与恢复在部署篇继续展开。
