# 第 50 章　安全地接收和处理头像

在代码仓库根目录运行本章命令。沿用第 49 章已完成迁移的独立 VERIFY，记下实际库名及一个已开通 Web 的账号。新建空库时按[第 49 章的 bootstrap、注册与开通步骤](../../database/chapter-49/README.md)准备一个账号。第 50 章无新增迁移。

```bash
nvm use
npm ci
npm run check
```

按[同一 VERIFY 的 API 启动命令](../../database/chapter-49/README.md#准备隔离库和-api)运行开发入口，核对命令末尾的预期库名。使用当前分支的锁文件安装 Sharp 及与本机平台相符的可选原生依赖。生产方式在独立运行目录复制 dist、package.json、package-lock.json 与 .npmrc，执行 `npm ci --omit=dev` 后按第 49 章提供数据库、Origin、HMAC 及邮件配置并运行 `npm start`。API 的工作目录应由本进程使用、可写，以便在其中管理 .avatar-tmp。把运行目录移到另一平台时，需在目标平台重新安装依赖。

## 用一张灯塔图查看裁切

导入[第 50 章集合](../../requests/chapter-50.postman_collection.json)，核对 baseUrl。用本地环境填写本轮账号的 email、password。按 05 登录、20 查看本人资料，再发 15 保存当前 Cookie 对应的 csrfToken。仅有旧用户 ID 的账号，按第 49 章改用 05 的本地副本登录。24 沿用这个 Cookie、固定头和写入令牌；另开会话或切换账号之后重发 15。

单发 24。进入 Body → binary，选择本机的 [harbor.png](harbor.png)，检查 Headers 中 Content-Type 为 image/png。Postman 显示文件找不到时，重新选择本地文件。收到 200 后查看响应类型 image/webp 和预览图，核对中央灯塔及左右两侧裁掉的太阳和帆船。复制 24 做格式对照。保留 image/png，把文件换成 [harbor.jpg](harbor.jpg)，查看 415 响应与 AVATAR_FORMAT；副本继承的成功断言此时会标红。把头改成 image/jpeg 再发，200 和预览断言都应恢复。重新发送 20，与刚才读取的本人资料逐字段比较。01～23 与前章相同，19 是需要手动取消的长连接。以上步骤均逐项单发。

两份文件是同一幅 720×360 插图。需要重新生成时，运行 `node examples/avatar-preview/generate.mjs`。脚本在本地绘图并导出两份栅格图。

## 让一个请求停在中途

小客户端每次用独立的本机会话登录，取得写入令牌后把 PNG 字节分块写入 HTTP 请求。已有账号时，无需再启动寄信进程。在 **Bash** 终端输入以下内容，先把示例邮箱换成本人的练习账号地址。若用旧用户 ID 登录，改用 `unset AVATAR_EMAIL` 和 `export AVATAR_USER_ID=你的练习用户ID`，后面各条命令相同。密码从终端静默读入当前 Bash 变量。函数通过管道传给这一次客户端；使用普通 Bash 会话，保持命令跟踪和自动导出关闭（`set +x`、`set +a`）。

```bash
set +x
set +a
export AVATAR_BASE_URL=http://127.0.0.1:3360
export AVATAR_EMAIL=reader@example.test
unset avatar_password
IFS= read -rs -p '本轮练习账号密码：' avatar_password
echo
avatar_upload() { printf '%s' "$avatar_password" | node examples/avatar-preview/upload.mjs "$1"; }
avatar_upload normal
avatar_upload slow
avatar_upload abort
avatar_upload race
avatar_upload timeout
```

AVATAR_BASE_URL 只接受回环 HTTP。登录遇 AUTH_RATE_LIMIT 时，按响应里的 Retry-After 等待再发。

- normal 完成一次预览，核对收到的文件可以按 256×256 WebP 解码。slow 先发 32 字节，其余分六块、每半秒续一块。用另一终端查看 API 工作目录下的 .avatar-tmp，比较传输中和响应后的子目录。观察下游变慢时的内存排队另运行 `node examples/avatar-preview/backpressure.mjs`。
- abort 在 800 毫秒后主动断开第一条连接，再发完整请求。在 .avatar-tmp 中核对本次目录已回收；一次后续成功说明有可用名额。race 同时打开三条只写前 32 字节的请求，等最先返回的一条报 429 AVATAR_BUSY，再补齐另外两条，分别收到 200。三条完成后新请求仍应返回 200。
- timeout 首块后停止发数据，等满接收期限，核对 408 UPLOAD_TIMEOUT，再跑新请求。以上各模式末尾用同一会话重读本人资料，再注销本客户端的会话。
- 正文的退出实验单独运行 `avatar_upload hold`。抄下本轮会话的 label。脚本只送首块，另一终端有约十秒观察目录并向本轮 API 的确切 PID 发送信号。正常排空可能读到 503 SERVICE_DRAINING；若读到 408 UPLOAD_TIMEOUT，说明已经错过接收窗口。连接复位时，核对进程、日志及本次目录再判断退出位置。按正文确认独占停机、核对并清理残留，再启动 API 并跑 `avatar_upload normal`。如果客户端提示注销未获确认，从另一个有效会话读取会话列表，按刚记下的 label 找到对应 ID 并撤销。

```bash
unset avatar_password AVATAR_EMAIL AVATAR_USER_ID AVATAR_BASE_URL
unset -f avatar_upload
```

完整回归按[第 49 章的独立测试库与固定用户步骤](../../database/chapter-49/README.md)准备；使用第 50 章分支重新构建后执行该命令中的全部 test/*.test.mjs。联调和回归分别指定库名与配置文件。
