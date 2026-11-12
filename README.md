# EPP 配套实践代码

本章练习「可靠地接收并保存请求正文」。

本章检出命令为 `git switch part-01/chapter-03`。命令、迁移目录和请求集合沿用项目中的实际文件名。

第 3 章从空项目建立原生 Node.js HTTP 服务。当前数据保存在单个进程的 `Map` 中，停止进程后丢失；本章仅供本机实践。

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

本章没有第三方依赖。`npm ci` 用于核对依赖清单与锁文件；服务监听 `http://127.0.0.1:3000`。

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

本章不包含数据库、登录、AI、分页、CORS 配置和生产部署。完整原理与操作步骤见 [EPP 后端开发实践](https://github.com/SamChowRock/EPP-Book)。

第三章支线“从字节到 JSON”另有独立示例。在项目根目录执行：

```bash
nvm use
node examples/buffer-boundary.js
```

示例主动切开一个 UTF-8 字符，对照逐块解码、合并后解码和 `StringDecoder` 的输出；无需启动 HTTP 服务。

## 开发与生产运行

运行模式由命令明确提供：`npm run dev` 和 `npm run debug` 使用 development，`npm start` 使用 production。NODE_ENV 决定库与应用的环境行为，文件监听和 Inspector 则由命令参数分别控制；更改模式要重新启动进程。请用开发进程修改代码，用独立的交付运行核对实际产物，不把本机调试服务当作生产进程。

请求日志只记录方法，不写原始 URL、查询值、请求正文或凭据。需要核对输入时，在 Postman 中查看自己发送的请求，并在调试器中观察变量；内部失败日志只记录异常类型，避免错误消息或堆栈带出数据。后续请求关联和结构化诊断在相应章节继续建立。

学习和日常修改默认使用 `npm run dev`：监听源码变化、自动重启，并在 `127.0.0.1:9229` 开启 Inspector。通过 Chrome 的 chrome://inspect 连接，修改保存后重新发送请求；重启会清空 Map，浏览器页面不会自动刷新。若调试连接断开，重新连接新进程。`npm run debug` 保留给需要在启动第一行暂停的排查。

生产运行使用 `npm start`，不监听文件，也不开启调试端口。开发与生产执行同一服务代码；不要同时启动两份服务争用业务端口。Node 原生 watch 追踪入口及导入模块，修改运行配置或依赖后手动重启开发命令；本阶段没有构建步骤。生产部署中的进程托管、HTTPS与恢复在部署篇继续展开。
