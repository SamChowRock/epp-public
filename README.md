# EPP 配套实践代码

第 2 章从空项目建立原生 Node.js HTTP 服务。当前数据保存在单个进程的 `Map` 中，停止进程后丢失；本章仅供本机实践。

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

```bash
curl -i http://127.0.0.1:3000/captures
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"I am not much of cook."}'
```

创建成功返回 `201`，复制响应中的 `id`，用 `GET /captures/<id>` 查看详情。列表返回 `{ "items": [...] }`。同一正文重复提交会创建两条记录。

原文必须是非空白字符串，至多 2000 个 JavaScript UTF-16 代码单元；保留原始空格。请求体限制为 16 KiB。错误通过 HTTP 状态码与 `{ "error": "..." }` 返回：无效输入 `400`、不存在 `404`、方法不支持 `405`、请求体过大 `413`、内容类型不支持 `415`。

运行 `npm run debug`，在 Chrome 的 `chrome://inspect` 中打开 Node 调试目标，继续启动后，在 `captures.set(capture.id, capture)` 设置断点并再次发送创建请求。调试器仅监听本机 `9229` 端口。停止时，在运行服务的终端按 `Ctrl+C`。

本章不包含数据库、登录、AI、分页、CORS 配置和生产部署。完整原理与操作步骤见 [EPP 后端开发实践](https://github.com/SamChowRock/EPP-Book)。

第二章支线“从字节到 JSON”另有独立示例。在项目根目录执行：

```bash
nvm use
node examples/buffer-boundary.js
```

示例主动切开一个 UTF-8 字符，对照逐块解码、合并后解码和 `StringDecoder` 的输出；无需启动 HTTP 服务。

## 开发与生产运行

学习和日常修改默认使用 `npm run dev`：监听源码变化、自动重启，并在 `127.0.0.1:9229` 开启 Inspector。通过 Chrome 的 chrome://inspect 连接，修改保存后重新发送请求；重启会清空 Map，浏览器页面不会自动刷新。若调试连接断开，重新连接新进程。`npm run debug` 保留给需要在启动第一行暂停的排查。

生产运行使用 `npm start`，不监听文件，也不开启调试端口。开发与生产执行同一服务代码；不要同时启动两份服务争用业务端口。Node 原生 watch 追踪入口及导入模块，修改运行配置或依赖后手动重启开发命令；本阶段没有构建步骤。生产部署中的进程托管、HTTPS与恢复在部署篇继续展开。
