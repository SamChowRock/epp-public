# 第 58 章　用户资料的业务约束与隐私

第 57 章使用第 56 章的代码。第 58 章从这个版本继续，在原用户行增加昵称与可见性，并单独记录改名的时刻。在本机 Node 24.22.1、PostgreSQL 18 上使用本章的[请求集合](../../requests/chapter-49.postman_collection.json)，按编号单发。集合沿用 01～19，19 是需手动取消的长连接，本章从已有会话做起时直接发 20。

## 准备隔离库和 API

先停止写入要备份的第 56 章练习库，备份并恢复到另建的第 58 章 VERIFY（[PostgreSQL 归档与独立恢复](../chapter-22/backup-restore.md)，替换为本轮库名，沿用本轮数据）。在 DBeaver 的这个新连接执行 `SELECT current_database();`，与建库时定下的名称对照。选一个已开通的练习账号，记下它的用户 ID 和当前登录方式；若已有记录或通知，再记一条 ID，用于升级后复查。也可从独立空库开始，迁移后再准备两个账号。

项目根目录的 .env.database-verify 使用该 VERIFY 的 DATABASE_URL，.env.test 用 TEST_DATABASE_URL 指向同一库。要寄注册信时，也把 .env.worker 的数据库与 Mailpit 的 SMTP 端口指向本轮环境，配置文件写法见[第 51 章](../chapter-43/README.md)。下方预期名来自建库记录，若你的库名不同须逐处替换。在项目根运行：

```bash
nvm use
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch49_verify
npm run db:verify -- migrate status
npm run check
```

上面的 deploy 用于恢复出的非空库；新建的空库把 deploy 换成 bootstrap。升级后在 DBeaver 查原用户 ID、昵称和可见性，首次升级时应为原 ID、NULL、false。旧会话在有效期内仍可发 20。若浏览器入口已换或 Cookie 已失效，用原凭据在新 API 登录，核对同一个 ID 及原有记录。反复跟做时以升级前记录的值为准。

启动 API 的终端与迁移终端可以分开。API 读取 .env.test，再将同一目标交给开发 watcher：

```bash
unset DATABASE_URL TEST_DATABASE_URL APP_ORIGIN PORT DB_QUERY_DEBUG
NODE_ENV=development node --env-file=.env.test --input-type=module -e '
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { withVerifiedDatabase } = await import("./scripts/verify-database.mjs");
await withVerifiedDatabase(process.argv[1]);
process.env.PORT = "3360";
process.env.APP_ORIGIN = "http://127.0.0.1:3360";
process.env.DB_QUERY_DEBUG = "false";
await import("./scripts/dev.mjs");' epp_ch49_verify
```

## 两个账号，一张资料卡

在 Postman 导入集合，选择一个未同步的本地环境保存 email、password、registrationToken 和 csrfToken。baseUrl 默认匹配上面的 3360。profileTargetId、nickname、nicknameVisible、expectedRenameStatus 使用集合变量的本地值，清除环境里的同名覆盖。以下用一个 Postman Cookie jar 先后登录 A 和 B，前四步将 23 的目标固定为 A。

1. 准备两个已激活且有 Web 资格的练习账号。若已有可用邮箱和密码，直接用 05 登录。仅有旧用户 ID 的账号可复制 05，在副本的前置脚本中将对象里的 `email: pm.variables.get("email")` 换成 `userId: pm.variables.get("loginUserId")`，保留密码、序列化和请求头。把旧 ID 填在本地环境的 loginUserId，再发送副本。若需注册，启动本机 Mailpit，在第二个终端按[第 51 章 Worker 启动命令](../chapter-43/README.md)使用预期名 epp_ch49_verify。把 email 换成本轮独有的练习地址，01 申请，读本轮邮件的令牌到 registrationToken，02 确认，按[开通 SQL](../chapter-36/02-grant-fixture.sql)同时替换邮箱与 02 返回的 UUID，核对一行并提交。B 重复这一过程，用不同地址。已有通道占用时，按[第 53 章事故恢复](../chapter-45/README.md)核对，再在原库准备第二位账号。若另选空 VERIFY，按上文 bootstrap 本章迁移，将 API、邮件 Worker 和 DBeaver 观察连接一起指向该库，重新在同一库注册并开通 A、B。
2. 用 A 的 email、password 发 05（已在旧章节重置过密码时填当前密码），再发 20。复制这次 20 返回的 userId 到 profileTargetId。在切换账号前后，20 都只读当前 Cookie 对应的账号。旧编号 12 会比对最后一次 02 保存的集合 userId；本章判断当前身份用 20。
3. 在第一次改名**之前**，用下方 SQL 查 A 的当前名字和窗口用量。发 15 取得 A 当前 Cookie 的写入令牌，把 nicknameVisible 设为 false，发 22 并核对 200、false。若 A 已有名字，保留它作本轮对照；若还没有名字，才把 nickname 填为「山雀」、expectedRenameStatus 填 200，发 21。20 能读到 A 的昵称与 false。切换至 B 的邮箱与密码，发 05、20，确认 ID 已变，再发 23，响应应为 A 的 ID 和 null。
4. 切回 A，重新登录、发 20 确认身份、发 15 取这个 Cookie 的令牌。把 nicknameVisible 设为 true 发 22。切回 B，登录后发 20、23，核对 A 发布的同一昵称。23 使用固定的 profileTargetId，B 的登录、注册和身份回查都不会覆盖它。按 A 的 ID 再查 SQL，两次切换可见性均不计次。
5. 为并发实验准备一位窗口内恰好改过两次名的账号。以要做实验的账号登录 Postman，发 20、15，按 20 返回的 userId 查询用量。用量为零时发两次 21，为一时发一次，每次都选一个与刚保存值不同的昵称；为二时直接保留当前值；为三时，改用另一练习账号并按它的用量准备，或等最早一笔满 720 小时后重查。expectedRenameStatus 保持 200。恰好两次时把 nickname 填回当前已保存的名字，重送 21 后用 20 与 SQL 核对，名字和次数都保持。
6. 按正文 49.5 在同源 Swagger 登录刚才这位账号，在浏览器核对 GET /profile/me 的 ID 与 SQL 相同。用正文控制台代码获取浏览器会话的 /auth/csrf，再用 Promise.all 并发提交两个彼此不同且都不同于当前值的昵称。比较 200 返回的名字和 429 的 NICKNAME_CHANGE_LIMIT，查同一 ID，窗口内应有三条有效事件。两份 HTTP 结果可以验证最后一个名额只用一次；观察数据库里的实际等待请按正文的行锁实验操作。
7. 回到 Postman，用刚才争名额的账号登录，发 20 读回胜出的昵称、发 15 取得当前写入令牌。把它的 ID 设为 profileTargetId。把 expectedRenameStatus 设为 429，再用 21 提交一个不同于当前值的新昵称。核对错误码、原昵称与计数。再把 nicknameVisible 明确改回 false，单发 22 应返回 200、false。让另一账号登录、发 20 确认身份、用 23 查看目标，其昵称应为 null。随后若继续测试满额账号的写入，先用满额账号重新登录、发 20 确认 ID、发 15 更新令牌。将 expectedRenameStatus 改回 200，把 nickname 填为 20 返回的当前名字，重送 21 仍可成功。登录若遇 AUTH_RATE_LIMIT，按该响应的 Retry-After 再试。

在 DBeaver 用被检查账号的实际 userId 替换下方占位符（前四步为 A，之后为争最后一个名额的账号），运行整条查询。它连同当前昵称一起返回次数；没有任何事件的账号也能查到零。生产中修改在取得账号锁后取数据库时钟，这条只读查询用于观察发出时的窗口。

```sql
SELECT u.id, u.nickname, u.nickname_visible,
       count(c.id) FILTER (
         WHERE c.changed_at > statement_timestamp() - interval '720 hours'
       ) AS used_in_window
FROM public.users u
LEFT JOIN public.nickname_changes c ON c.user_id = u.id
WHERE u.id = 'REPLACE_WITH_OBSERVED_ACCOUNT_ID'::uuid
GROUP BY u.id;
```

全套回归另建空测试库，例如 epp_ch49_regression。项目根另建 .env.test-regression，其中 DATABASE_URL 和 TEST_DATABASE_URL 都填这个测试库的连接串。联调用的 .env.test 继续指向先前的 VERIFY。先把下面的库名换成建库时定下的测试库名，运行 bootstrap，已完成本章迁移的测试库跳过此步。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG
node --env-file=.env.test-regression scripts/deploy-verify.mjs bootstrap epp_ch49_regression
```

在该测试库按[第 49 章的固定测试用户步骤](../chapter-42/README.md)准备样本，再运行：

```bash
unset TEST_DATABASE_URL DATABASE_URL
npm run build
NODE_ENV=test node --env-file=.env.test-regression --test --test-concurrency=1 test/*.test.mjs
```

在输出中核对 test/profile.test.mjs 的资料投影、改名竞争和 720 小时边界用例均已执行。干净运行目录复制 dist、package.json、package-lock.json、.npmrc，执行 npm ci --omit=dev，注入数据库、APP_ORIGIN、CURSOR_HMAC_KEY 与本机 SMTP 配置后 npm start。资料读写由 API 完成。结束后关掉本轮开发进程，在 Postman 本地环境清除密码和令牌。
