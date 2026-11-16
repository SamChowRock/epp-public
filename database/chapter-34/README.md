# 第三十九章：鉴权与授权

起点 `part-05/chapter-38`，完成分支 `part-05/chapter-39`。无新依赖。认证回答会话属于谁；账号状态与Web资格决定能否使用当前入口；每条业务查询仍按已认证userId判断归属。

1. 沿第25章备份并独立恢复非空VERIFY，停该库写入，保存原用户ID、created_at和业务详情。核对`.env.database-verify`，清除shell中的DATABASE_URL、SHADOW_DATABASE_URL、DB_QUERY_DEBUG后，运行`npm run db:verify -- migrate status`、`npm run db:verify -- migrate deploy`、`npm run db:verify -- migrate status`。本次迁移只加users.status和web_enabled：原用户active/true，新INSERT默认active/false；旧业务、密码、会话及期限不重建。
2. Node24.22.1下`npm ci`、`npm run check`。`.env.test`的TEST_DATABASE_URL仅指向VERIFY；从它启动开发API前清除旧DATABASE_URL/TEST_DATABASE_URL/APP_ORIGIN/DB_QUERY_DEBUG覆盖，按正文设置一致的PORT/APP_ORIGIN及DB_QUERY_DEBUG=false。用原凭据登录，原素材ID仍200。生产与开发入口沿第38章，当前产物只连接完成本章迁移的库。
3. DBeaver连接同一VERIFY，用[01投影](01-access-projection.sql)看状态，再按[02建本地账号](02-create-local-user.sql)创建并保存一个新的UUID。示例ID已存在时先查清归属，不覆盖、不删除重建。按正文隐藏输入命令执行`node scripts/password.mjs init <该用户UUID>`，先把.env.test的TEST_DATABASE_URL显式转成DATABASE_URL并关闭DB_QUERY_DEBUG；不能只加载.env.test就假定密码工具会读取TEST_DATABASE_URL。新命令可省略UUID，仍只操作原固定用户。init只为已存在用户创建凭据，主键冲突拒绝覆盖；verify只验证密码材料，不开通Web资格。
4. Postman导入[本章集合](../../requests/chapter-34.postman_collection.json)，baseUrl、原captureId和两账号ID按本地值填写，密码仅保留本地。复用上一章JSON.stringify及双花括号转义，不手改密码。先A登录和原素材200，再B正确凭据登录403/WEB_ACCESS_DENIED。只对已确认B执行[03开通](03-grant-web.sql)，检查RETURNING恰为预期一行后COMMIT；失败或零行先ROLLBACK、查询现状。B重新登录后，同一个A的详情/PATCH均404，B的列表只含本人记录。登录切换共享jar，不要以标签页名称判断当前账号。
5. 保留B当前Cookie，对B执行[04撤销](04-restrict-access.sql)中的一段事务并COMMIT。下一次/auth/me为403，session行和期限不变。重新执行03开通，同一个未过期、未撤销Cookie恢复200；不需要再次登录。随后单独演练status=disabled，错误码ACCOUNT_DISABLED；[05恢复状态](05-restore-access.sql)只改status，不代替开通web_enabled。不要整文件运行多段事务或留下idle in transaction。
6. 受限状态仍能POST /auth/logout加JSON {}，返回204并删除当前会话；恢复账号和Web资格后原Cookie仍401。过期与主动撤销也仍401。403不能当密码错误去重置凭据；普通业务中通过入口后已经在途的请求可能完成。登录/改密则在user→credential→session顺序下核对提交资格，状态更新与其行锁串行。
7. [三连接行锁实验](06-account-lock.sql)按正文分两轮、逐块执行，先保存不同PID，再观察真实阻塞；实验仅延长SQL连接的等待保护，不改变API期限，不执行登录或改密。每轮结束所有事务并核对B状态。
8. `.env.test`确认隔离目标后`npm test`。新增测试覆盖默认拒绝、现有Cookie撤销/恢复、受限退出、真正的双向锁等待；旧跨用户读取/写入/回执/游标测试继续执行。正常会话测试fixture需显式webEnabled:true，不修改数据库默认值迎合测试。生产产物按第38章干净安装运行，检查登录200、受限403、退出204/401、docs404、正常SIGTERM。
9. VERIFY通过后，独立备份/恢复DEV、停写并用`npm run db -- ...`升级。不要把VERIFY第二账号、虚构密码或开通SQL复制到日常库；逐个确认日常账号需求。暂停时退出自己的测试会话，断开调试与DBeaver并停止自己的API；数据和迁移保留，下次从目标库、状态投影、登录开始。

Web资格约束当前Cookie服务入口，不识别客户端类型；未来MCP/小程序的许可不能直接复用这个布尔值。暂停资格保留会话，重新开通会恢复所有尚未过期的旧Cookie，包括复制出去的Cookie；如目标是让旧凭证彻底失效，应另行撤销会话。完整账号冻结、数据删除和跨入口处理在后续综合篇实现。本章没有管理员HTTP接口、角色系统或独立管理CLI。
