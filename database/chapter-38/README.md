# 第45章：外部登录

以第44章非空快照准备独立 VERIFY。先在 DBeaver 查当前库、原用户和一条已存素材，清除 shell 环境覆盖 `unset DATABASE_URL SHADOW_DATABASE_URL`，再运行 `npm ci`、`node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch38_verify`、`npm run db:verify -- migrate status`、`npm run check`。只新增 oidc_identities 表；检查旧 ID、原文、归属和时间未变。不要把分支切换当作数据库迁移。确认后才另行备份并升级日常开发库。

从当前分支初始化专用空库时，先运行 `npm ci`，设置 `.env.database-verify`，清除 shell 的 `DATABASE_URL` 和 `SHADOW_DATABASE_URL` 后运行 `node --env-file=.env.database-verify scripts/deploy-verify.mjs bootstrap epp_ch38_verify`，最后运行 `npm run db:verify -- migrate status`。命令末尾都换成建库或恢复时确定的库名。脚本在实际连接查询 current_database()，一致才部署。bootstrap 先复制第 40 章迁移原件建立基线，再部署当前完整目录；已有前章历史用 deploy。非空副本另做旧数据对照。

让 .env.test 的 TEST_DATABASE_URL 指向这份 VERIFY，使用 Node 24.22.1：

```bash
npm run build
unset DATABASE_URL TEST_DATABASE_URL
verify_db='epp_ch38_verify'  # 换成建库或恢复时取的库名
node --env-file=.env.test --inspect=127.0.0.1:9480 examples/oidc-lab.mjs "$verify_db"
```

在浏览器打开 http://127.0.0.1:3380/auth/oidc，第一次展开“关联已有账号”，使用终端的本轮虚构 userId 与密码。确认页面来自 localhost 的独立实验提供方；选择实验身份 A，回到原地址，结果框应显示原用户 ID。用同一浏览器 GET /captures/本轮captureId 核对旧素材。随后可以用普通登录复用映射，或在提供方取消。首次就选择普通登录会得到新建、未开通的账号，之后不能强行绑定回另一个账号；在独立浏览器窗口用实验身份 B 普通登录，重复一次应得到同一待开通 ID。真实提供方也需两个独立且可重复选择的测试主体。不要用真实密码。实验组使用临时签名密钥、真实授权码交换、RS256、state／nonce／S256；不运行外部厂商的服务，也不授予生产资格。

[两条只读 SQL](01-observe.sql)分别核对库及本地用户的映射、素材和存活 Web 会话。VS Code 选择 Chapter 38: OIDC callback (local VERIFY)，断在 oidc.controller.ts 内 resolveOidcAccount 调用前，读 Boolean(subject) 与 Boolean(proof)，不要展开密码证明和令牌。继续后移除断点再观察正常请求。可导入[本章 Postman 集合](../../requests/chapter-38.postman_collection.json)；浏览器 Cookie 与 Postman Cookie 独立，两者的事务不能混用。终端按 Return 清理本轮实验数据、停止两个服务；DBeaver 断开，不清空库。测试用 npm test，也必须使用独立 VERIFY。

正式客户端使用运营方配置的 OIDC_ISSUER、OIDC_CLIENT_ID、OIDC_CLIENT_SECRET；注册类型为机密 Web 客户端，client_secret_basic、code、S256、query 回调、RS256。回调地址必须精确登记为 APP_ORIGIN/auth/oidc/callback。只支持一个受信 issuer、一个 API 进程；单个浏览器同时只保留最新事务。生产 APP_ORIGIN 和 issuer 均为 HTTPS；若供应商拒绝本机地址，完成 HTTPS 部署后再联调。不启用时删除或注释三项，不写空字符串；新进程须同样未继承这三个变量。未配置时仅外部登录开始返回503。新建账号默认不发 Web 会话，管理员按第39章核对 userId 并决定资格；不拿供应商邮箱创建本地邮箱凭据。已有账号关联需当前密码，受限／停用仍遵守既有规则。

开发用 npm run dev、9229 Attach；热重启后重开未完成的登录。交付用 npm run check，复制 dist、config 和两份 npm 清单，在干净目录 npm ci --omit=dev，通过进程环境提供 DATABASE_URL、CURSOR_HMAC_KEY、APP_ORIGIN 和需要的 OIDC 配置，然后 npm start。实验提供方、测试、.env 和开发调试端口不属于交付。
