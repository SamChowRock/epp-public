# 第44章：小程序身份与会话

从 `part-05/chapter-43` 的非空数据库继续。追加迁移 `20261106003700_mini_identity`：旧用户 `mini_enabled=false`，旧会话 `channel=web`，新增 `wechat_identities`；既有 userId、密码、邮箱、记录和所有权保持。Node固定24.22.1，无新增依赖。

先按第20、24章的备份／恢复步骤准备独立VERIFY，把第43章非空副本恢复到其中。DBeaver新连接先运行 `SELECT current_database(), current_user`，保留若干旧用户、素材和学习来源的完整值；不要在日常DEV上先试。确认 `.env.database-verify` 指向VERIFY，在项目根运行：

```bash
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch37_verify
npm run db:verify -- migrate status
npm run check
```

从当前分支初始化专用空库时，先运行 `npm ci`，设置 `.env.database-verify`，清除 shell 的 `DATABASE_URL` 和 `SHADOW_DATABASE_URL` 后运行 `node --env-file=.env.database-verify scripts/deploy-verify.mjs bootstrap epp_ch37_verify`，最后运行 `npm run db:verify -- migrate status`。命令末尾都换成建库或恢复时确定的库名。脚本在实际连接查询 current_database()，一致才部署。bootstrap 先复制第 40 章迁移原件建立基线，再部署当前完整目录；已有前章历史用 deploy。非空副本另做旧数据对照。

`prisma generate` 不升级数据库。DBeaver刷新表结构，核对旧用户新增开关为false、旧会话为web，按原ID重读旧记录。新增表应为空，不给旧用户推断OpenID。核对完成才单独备份并升级DEV；切回旧代码不会自动撤销迁移。

## 不依赖平台账号的本地观察

`.env.test` 必须设置 `TEST_DATABASE_URL` 指向已迁移VERIFY；脚本没有回退DEV的行为。在同一终端运行：

```bash
npm run build
unset DATABASE_URL TEST_DATABASE_URL
verify_db='epp_ch37_verify'  # 换成建库或恢复时取的库名
node --env-file=.env.test --inspect=127.0.0.1:9470 examples/mini-login-local.mjs "$verify_db"
```

脚本创建本轮两个虚构用户，经Web入口先存素材，再用独立的 `MiniService` 实例替换平台交换并关联；应用的真实登录适配器不变。随后读取同一素材：原用户200，另一用户404。没有调用微信，不把任意OpenID接进业务路由。3370必须空闲；若占用，先选自己的其他空闲端口，给命令加 `PORT=3371`。

终端停在观察提示时，导入[本章集合](../../requests/chapter-37.postman_collection.json)与根目录生成的 `.mini-local.postman_environment.json`，只使用Postman本地、未同步模式；环境文件含本轮令牌，权限0600、已忽略，不分享。选择该Environment，确认baseUrl，直接从03开始，01／02留给真实平台。每条请求已设置Disable cookie jar，避免同机旧Cookie一起发送；无环境时变量为空不会自动登录。

03身份200；04按captureId读原素材200；05另一账号404；06同时列出web和mini会话；07取Web CSRF返回403。DBeaver用[安全查询](01-observe.sql)，替换本轮UUID，核对同一用户的一条映射与两种会话，不查令牌摘要。可用[限制资格](03-restrict-mini.sql)观察旧mini令牌403、Web不受影响，再用[恢复资格](02-grant-mini.sql)恢复。每个事务先检查影响的一行，再单独COMMIT；不符合预期就ROLLBACK。

VS Code在“运行和调试”选择 `Chapter 37: mini session (local VERIFY)`，按F5连接脚本的9470端口。断点放在 `src/session-http.ts` 的 `if (identity)` 行；04请求暂停后在Debug Console输入 `({ mini, authenticated: Boolean(identity), sameOwner: identity?.userId === '本轮userId' })`，把字符串替换成本轮原账号UUID。不展开令牌／Cookie／配置。继续执行，移除断点，再发送04确认正常结果；人工暂停的耗时不作性能数据。

保持两种会话有效，先选一组操作。只退出小程序时发08退出204、09旧令牌401；检验全通道撤销时跳过08，先用03确认mini为200，再发07a用环境中的旧Web Cookie取CSRF（200），07b用本轮虚构密码改密（204），07c、07d分别重放原Cookie与Bearer，均应401。练习账号没有验证邮箱，邮件重置须另备已验证邮箱和可收取重置凭据的测试账号。要做另一组，按Return清理后重新启动、重新导入并选择新环境。完成后再回终端按Return。脚本清理本轮素材、映射、凭据和会话，移除环境文件并关闭API；Postman中已导入的变量需自行清空，不会随磁盘文件删除。强制杀进程可能留虚构数据，按终端本轮两个UUID检查，切勿按全表清空。脚本不改旧用户。

## 接真实微信

按[最小小程序说明](../../mini-program/README.md)准备真实账号与域名。API `.env` 中同时设置 `WECHAT_APP_ID`／`WECHAT_APP_SECRET`；两者缺一启动失败，都不设则业务正常、平台登录503。秘密只在后端，不进小程序、Postman集合、截图或日志。正式运行无本地替换开关。登录与关联入口分别是 `/auth/mini/login`、`/auth/mini/link`，只接受code；后者额外要求已有userId与当前密码。每次动作重新wx.login，不复用失败请求的code。

已有账号先关联，避免先为同一个平台身份创建另一个本地用户。首次新平台身份会保存默认未开通的用户和映射，返回200及 `{userId,miniEnabled:false}`，不含令牌；管理者按这个ID确认目标后开通mini资格，再用新code登录。关联已有账号也不改变资格；身份已属于别的用户时409，不自动合并。一个AppID下一个本地账号只关联一个微信身份。

默认会话8小时，两类合计最多20条。已有mini资格的账号满额时，本次首次关联与签发一起拒绝；先释放一个会话，再取新code重新关联。没有mini资格时保存已核实的映射并返回待开通。数据库只存摘要。Bearer仅接受mini会话，Cookie仅接受web；两者同时出现400。业务沿用原userId隔离，退出／撤销／过期规则共用；密码重置和Web主动改密撤销全部两类会话。小程序不访问 `/auth/password`、`/auth/csrf`。身份映射不会因退出或重置被删除，微信仍是一个独立登录途径。

## 交付与恢复

开发仍用 `npm run dev`，自动编译重启及9229 Attach沿用前章。新增环境配置后重启开发入口；配置仅启动时读取。正式构建 `npm run check`；干净运行目录只复制dist、config、package.json与package-lock.json，执行 `npm ci --omit=dev`，通过进程环境注入DATABASE_URL、APP_ORIGIN、CURSOR_HMAC_KEY及选用的微信配置，`npm start`。不复制test、examples、mini-program或.env；默认docs关闭、无Inspector。前端小程序另由开发者工具预览与发布。

`npm test` 是有限回归入口，要求独立VERIFY。登录接口超时可能已经交换code、保存映射或签发会话；以新code再次登录，核对userId和自己的会话列表，撤销多余会话。不能靠重发旧code取得旧响应；不能把外部调用包进数据库事务等待。
