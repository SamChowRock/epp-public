# 第三十八章：Session 与 Cookie

起点 `part-05/chapter-37`，完成分支 `part-05/chapter-38`。新增 sessions 迁移，保留原用户、密码与全部业务行，不初始化第二份凭据。依赖无变化。未实现账号权限、注册、密码重置或跨域前端。

1. Node 24.22.1 下 `npm ci`、`npm run check`。沿正文在独立非空 VERIFY 保存旧身份、详情与凭据创建时间，停该库写入，核对 `.env.database-verify`，清除 shell 的 DATABASE_URL、SHADOW_DATABASE_URL、DB_QUERY_DEBUG 覆盖值，再运行 `npm run db:verify -- migrate status`、`npm run db:verify -- migrate deploy`、`npm run db:verify -- migrate status`。新表初始为空；重跑不得清表。
2. `.env.test` 的 TEST_DATABASE_URL 只指向升级后的独立 VERIFY。沿第35章方法从该值启动调试API，关闭DB_QUERY_DEBUG，设置与监听地址一致的APP_ORIGIN，如 `http://127.0.0.1:3000`。不要把数据库口令写进APP_ORIGIN。没有Cookie时GET /captures为401，这是行为变化。
3. Postman导入[本章集合](../../requests/chapter-33.postman_collection.json)。核对baseUrl、userId与原记录ID。password只存本机变量，使用离线轻量客户端／本地Vault或禁用共享；不得上传、导出秘密值。登录与改密的Pre-request脚本用JSON.stringify序列化整份正文，Body只有未加引号的{{authBody}}，并转义内部{{，支持密码中的引号、反斜杠和模板样式字符；本地密码变量保存原值，不手工转义。每次只发送当前步骤，不运行整个集合。先登录，再看/auth/me和旧详情。Cookie由jar管理，响应身份字段不包含令牌；同一域的Cookie不按端口隔离，不要同时测试多个共用Cookie名的服务。
4. DBeaver连接同一个VERIFY，运行[安全投影](01-session-projection.sql)，对照label、到期时间与当前用户；不使用SELECT *，不截图token_digest或Cookie。会话UUID只是撤销用的记录标识，也不出现在公开截图。要核对旧业务归属，复用第37章01-before.sql与原详情，不能只看首页计数。
5. 用另一独立Cookie jar的客户端登录同一用户；可使用浏览器的同源/docs登录，与Postman的jar分开。列表取得该会话公开管理ID，填targetSessionId，从另一会话DELETE。撤销方仍200，被撤销方下一次401；重发DELETE204。不要把设备label当可信设备指纹。
6. 退出用POST /auth/logout加JSON {}，可匿名或过期后重复发送。服务删除当前记录并清Cookie；只删浏览器Cookie不会撤销服务端记录。过期演练只在VERIFY修改一条已保存管理ID的行，使用[02-expire-session.sql](02-expire-session.sql)并核对RETURNING只影响一行。下一次请求401。
7. 主动改密先重新登录，再填currentPassword与newPassword发送POST /auth/password。204后本用户所有会话删除，当前Cookie清除；旧密码不能登录，新密码获得新会话。仅在独立VERIFY修改虚构账号，不复制密码到DEV。响应丢失时先用新密码登录核对，不把超时等同回滚、不自动重放改密。
8. `npm test`覆盖旧业务与两用户会话隔离，测试会创建并清理临时用户、密码与会话；不能指向日常库。独立产物目录复制dist、package.json、package-lock.json、.npmrc，执行`npm ci --omit=dev`；由进程环境提供DATABASE_URL、持久CURSOR_HMAC_KEY、APP_ORIGIN，运行`npm start`。默认docs关闭、无Inspector；先401、登录后旧详情200、退出后401，SIGTERM正常停止。
9. VERIFY确认后备份并独立恢复DEV，停写，再将迁移命令换成`npm run db -- ...`。不重跑密码init、不重新导入旧业务。升级后所有旧客户端必须先登录；回退到第37章会恢复固定身份，不能当作保留认证边界的安全回退。

Cookie：HttpOnly、SameSite=Strict、Path=/、不设Domain，固定8小时。HTTPS APP_ORIGIN使用Secure和__Host-epp_session；仅HTTP回环练习用epp_session。服务端时间决定有效性，每次请求查库。无滑动续期；当前登录清理本人过期行，每人最多20个会话。每进程密码计算同时2个，登录/改密每IP一分钟合计10次，成功失败都计数；429后等Retry-After或稍后再试。这里不用代理转发IP、不开放CORS，第40章继续公开入口和容量设计。

安全日志只保留路由模板、状态、耗时与请求ID，不记录密码、Cookie、令牌摘要或原始请求。数据库query事件与调试器也可能看到秘密，诊断只观察身份/布尔结果，分享前裁剪。暂停时退出本次会话、关闭自己的API并断开DBeaver；保留迁移及原数据。恢复先检查目标与迁移，再登录；无需再次初始化。
