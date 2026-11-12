# 第40章浏览器入口实验

从第39章已迁移的非空VERIFY继续，无新迁移，不初始化或覆盖已有密码。测试连接与日常DEV分开。主服务入口变化：所有POST/PATCH/DELETE带`X-EPP-Request: 1`；有效会话的写请求还要带`GET /auth/csrf`取得的`X-CSRF-Token`。登录尚无新会话，不要求Token；无有效会话的重复退出也不要求Token。

先`npm run check`。在交互式zsh中读取已确认的独立测试连接，不打印值：

```bash
unset DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG APP_ORIGIN TRUST_PROXY_IPS
verify_database_url=$(node --env-file=.env.test -e '
const value = process.env.TEST_DATABASE_URL;
if (!value) process.exit(1);
process.stdout.write(value);
')
if test -n "$verify_database_url"; then
DATABASE_URL="$verify_database_url" DB_QUERY_DEBUG=false PORT=3352 APP_ORIGIN=http://127.0.0.1:3350 npm run dev
fi
```

另一个终端进入同一项目，运行`node examples/browser-boundary/server.mjs`。它只绑定127.0.0.1，页面与代理在3350，跨源页面在3351，API在3352。源码实验不进入dist，不能用作公网代理。API只接收当前公开源3350，不能把APP_ORIGIN误填成内部3352。

打开3350，输入VERIFY已有用户及虚构密码，登录→取Token→不带Token创建403→带Token创建201→身份200。结果区不显示秘密。每次合法创建都会新增，不要因响应丢失直接重放。浏览器Network中检查方法、Origin、Sec-Fetch-Site、预检和状态；Cookie／Token值只在本地查看，不保存到截图或日志。

保留会话，打开3351：简单POST实际到达API并403，JSON POST预检405后不发送写入，GET到达API并200但响应不可读；对照服务端日志，不只看页面的fetch失败。回3350身份仍200，正常退出204，再读401。两终端Ctrl-C停止本轮服务，保留数据库和样本；重启或换会话后重新取Token。

默认不信任转发头。确需观察代理来源时，只在独立实验中显式设置`TRUST_PROXY_IPS=127.0.0.1`；代理覆盖三个X-Forwarded头，保留原Origin。本机能直连API的其他进程也进入该信任边界，不能外推为多租户环境安全。公开部署需网络隔离、TLS和实际拓扑核验；多实例统一额度需共享原子计数，当前Map在重启时清空。

[本章Postman集合](../../requests/chapter-35.postman_collection.json)按01～08逐项执行，先选空白本地Environment，02保存csrfToken，password仅保留本地。原33／34集合在本分支已补两个头，换账号后重取Token；更早集合属于各自章节快照。不要批量执行改密、受限账户等有前置步骤的旧集合。

运行`npm test`核对既有行为与新增边界。生产交付沿原说明复制dist、package.json、锁文件与.npmrc后干净安装运行依赖，单独提供VERIFY连接、持久游标密钥与APP_ORIGIN，`npm start`无调试／自动重启、默认关闭文档。验证登录、旧记录、Token、CSRF拒绝、退出及SIGTERM释放；不复制本实验页面。
