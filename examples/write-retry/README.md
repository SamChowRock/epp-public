# 第30章：刷新后继续原来的提交

正式API的 `POST /captures` 与 `POST /captures/:id/revisions` 支持可选 `Idempotency-Key` 小写UUID。缺头仍为旧请求语义；带头的首次与重放都返回201，创建的Location和ID保持，追加保留原修订号。同用户、同动作、同键改变输入返回409。不要在每次发送前重新生成键。

先按第29章配置独立VERIFY库，在项目根运行 `nvm use`、`npm ci`、`npm run db:verify -- migrate deploy`、`npm run check`。保留旧业务与旧采纳回执；新增表初始为空。原API仍使用 `npm run dev`，Inspector与生产入口保持原约定。`npm test` 只使用 `.env.test` 的显式 `TEST_DATABASE_URL`，不能指向日常库。

## 浏览器练习入口

本目录页面不随生产dist发布。固定身份夹具只在development/test运行、只绑定回环，使用正式CaptureCommands处理带键创建/追加；只提供这些操作和本章所需的读取、身份观察。它不提供认证，也不能替代正式API的完整契约。LAB_USER_ID来自启动进程，业务请求不能改变它。读取不接受未说明查询参数。

在DBeaver的独立VERIFY副本加入两名合成用户（前章固定甲已存在则保留）：

```sql
INSERT INTO public.users(id) VALUES
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;
```

先完成构建，再在项目根两个终端启动。第一终端使用 `.env.database-verify` 中的VERIFY连接，显式清除继承环境同名值；别把连接串贴进截图或公开记录。

```bash
unset DATABASE_URL
NODE_ENV=development API_PORT=3000 \
LAB_USER_ID=10000000-0000-4000-8000-000000000001 \
node --env-file=.env.database-verify examples/write-retry/api-fixture.mjs
```

```bash
PORT=3030 TARGET_PORT=3000 DROP_SUCCESS_ONCE=true \
node examples/write-retry/server.mjs
```

在Chrome打开 `http://127.0.0.1:3030`。先填原文提交，首次成功响应会在正文读取完成前被截断；DBeaver运行 `database/chapter-30/inspect.sql`确认已提交，再刷新同一页签，点击“继续上次提交”，得到原ID。代理先完整收完上游201，再发送201头和不完整JSON；浏览器可能已取得状态，但读取正文失败。代理对每个键只截断第一次201，恢复过程中保持代理运行；重启代理会重置故障记录。默认不设 `DROP_SUCCESS_ONCE` 时正常转发。

追加操作填写原素材ID。再次提交也是新操作，会产生新键。旧操作尚待确认时不开始新操作；清除待办仅删除本地恢复依据，不会撤销已发送请求。

换身份对照：先让甲留下待确认操作，停止第一终端的fixture，以相同端口、相同库和乙的LAB_USER_ID重启，保留代理及浏览器页签。刷新后页面应清除旧待办，不显示甲的原文，不自动POST。查看Chrome Network及乙的列表，确认没有甲的旧重发。实验后停止两项服务。

## 真实会话章节

第38章以后停止固定身份fixture，使用正式API；第30章不能提前开启这些会话选项。先按第37～39章在独立VERIFY中准备密码凭据及所需Web资格，不重新初始化已有密码。Postman的Cookie jar与浏览器不同，不能用“Postman已经登录”代替页面登录。

以下沿身份篇从 `.env.test` 读取VERIFY连接；先核对TEST_DATABASE_URL确实指向这份独立库，禁止指向日常库。API和页面都从当前章节的项目根运行，不把第30章旧dist当作身份篇正式API。

```bash
unset DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG APP_ORIGIN
verify_url=$(node --env-file=.env.test -p 'process.env.TEST_DATABASE_URL || ""')
if test -n "$verify_url"; then
  DATABASE_URL="$verify_url" DB_QUERY_DEBUG=false PORT=3000 \
  APP_ORIGIN=http://127.0.0.1:3030 npm run dev
fi
unset verify_url
```

第二个终端启动页面，浏览器打开 `http://127.0.0.1:3030`：

```bash
PORT=3030 TARGET_PORT=3000 SESSION_MODE=true DROP_SUCCESS_ONCE=true \
node examples/write-retry/server.mjs
```

页面显示用户UUID、密码和登录按钮。用VERIFY已有账号登录，提交时立即清空密码框，浏览器处理HttpOnly Set-Cookie，页面随后请求 `/auth/me` 确认身份。开始登录先清除旧输入与待办，并抑制旧请求的迟到结果；密码只进入本次登录POST正文，不写storage或日志。业务正文不能指定作者。登录后的创建／追加仍先保存原owner、路径、键和原Body，再发送。

第40章以后保留正式API的 `APP_ORIGIN=http://127.0.0.1:3030`，停止旧页面代理，以同端口增加CSRF模式启动：

```bash
PORT=3030 TARGET_PORT=3000 SESSION_MODE=true CSRF_MODE=true DROP_SUCCESS_ONCE=true \
node examples/write-retry/server.mjs
```

登录POST只加JSON类型和 `X-EPP-Request: 1`，Origin由浏览器产生，不要求尚未建立会话的CSRF Token。之后业务POST先取 `/auth/csrf`，携带 `X-CSRF-Token`、`X-EPP-Request: 1`、原 `Idempotency-Key` 与原 `X-Expected-Session`。代理保留Cookie、Origin和这些头，只连接固定回环上游，不伪造身份。登录路由只在SESSION_MODE开启时转发；生产API不挂载这份实验页或故障开关。

每次刷新或重试先确认身份，真实会话owner包含userId和sessionId，同用户重新登录得到新sessionId也清旧待办。`X-Expected-Session`来自原待办，服务端先认证实际Cookie再比较，不符返回401/SESSION_CHANGED，阻止另一页签换Cookie后把旧正文写入新用户。它不是CSRF替代品；来源或Token失败时不能删操作键自动改成新请求。

退出先清本地内容，再请求正式 `/auth/logout`；迟到结果不能重新显示，退出请求失败会明确提示尚未确认服务端撤销。隐藏页签时隐藏正文，返回后复核身份再显示；不能瞬间知道另一页签何时换Cookie。存储读取或清除失败时保持错误，不把未删除的待办称为已删除，也不发送无法可靠保存的新操作。

`sessionStorage`不保存密码、Cookie或CSRF Token；owner中的sessionId用于期望身份比较，不作为认证凭据。它能跨本页签刷新，不是跨设备离线队列。恢复过程中保持代理运行，重新启动代理会清除故障键集合。页面检查201及创建／修订的必要正文字段，创建Location另用Postman核对；代理会原样转发该头。

源码中的PendingWrite状态机与代理可用 `node --test test/write-retry-browser.test.mjs` 验证；HTTP代理测试需要本机回环监听权限。真实账号资格、CSRF拒绝与数据库零写入按各章在独立VERIFY检查，不把纯页面测试当作真实会话集成验收。
