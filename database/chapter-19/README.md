# 第十九章：把已有记录接到 HTTP

从 `part-03/chapter-18` 继续，完成代码分支为 `part-03/chapter-19`。先完成基线登记，保留 `epp_dev` 的开发用户与原文；本章不改 Schema／迁移，也不重跑 seed。三个接口改用 PostgreSQL，使用固定开发用户，尚无登录，不用于开放多用户服务。

## 日常入口

1. 在 DBeaver 日常连接运行 `01-inspect-api-data.sql` 的身份与列表部分，确认 `127.0.0.1:55432 / epp_dev / epp_owner` 和前章原文。
2. 使用 Node 24.22.1，`npm ci`、`npm run check`。按根目录 `.env.example` 补齐已有 `.env`，保留自己的其他配置；填写已编码密码的 DATABASE_URL。API 不加载 `.env.database`。不要打印或提交 URL。
3. `npm run dev`。先看到 database.ready，再看到 app.ready；数据库失败则不监听。修改 `.env` 要停掉整个 dev 命令后重启；修改 TS 自动编译重启，数据库行保留。
4. 导入 `requests/chapter-19.postman_collection.json`，先读已有列表／详情，再新建含 `%`、`_`、反斜线和 emoji 的原文；保存返回 ID 后，在 DBeaver Data 网格刷新核对同一行。已有通用集合继续适用。

Prisma Client、CLI、adapter-pg 固定 7.10.1；pg 为 8.16.3，@types/pg 为 8.16.0。tsconfig 的 lib 使用 ES2024 来声明 String.isWellFormed，运行能力由已固定 Node 提供。Schema 生成与构建仍不要求连接或秘密。

## 当前语义

- 每条 API 池连接通过 options 固定 TimeZone=UTC，规避当前适配器在非 UTC 会话下的时间偏移；用数据库 epoch 对照创建响应与读取结果，不只做 ORM 自洽检查。
- 返回 id、originalText、createdAt；不返回 userId。createdAt 从 Date 映射成 ISO UTC 字符串。
- 先按固定归属和 q 筛选，再按 created_at/id 升序，最后 limit；不再承诺 Map 插入顺序。未给 limit 仍返回全部匹配，暂非有界分页接口。
- q 使用 strpos 的字面、大小写敏感匹配；SQL 参数独立传递。原文与 q 必须是无 NUL 的良构 Unicode；原文仍保留空格、最多 2000 UTF-16 单元，q 最多 200。
- 非规范小写 UUID 的详情路径仍为 404；合法但不存在或不属于固定用户也为 404。数据库故障不转成空列表／404。
- 临时连接／容量／超时失败返回 503/STORAGE_UNAVAILABLE；结构错误及当前不应发生的约束失败返回 500/INTERNAL_ERROR。POST 的失败响应不证明没写入，不自动重试。

## 图形排错

`DB_QUERY_DEBUG=true` 仅允许明确的 development 模式。重启 dev，在 `database.service.ts` 的 query 回调处打断点，使用虚构输入检查 event.query、event.params、event.duration。日志仅写耗时；不打印 SQL／参数。把查询意图带回 `01-inspect-api-data.sql` 的 PREPARE／EXECUTE，对比输入、类型、排序与结果。结束后设回 false 并重启。

在另一个 DBeaver 编辑器运行 `02-observe-connections.sql`。每次重新执行查询，区分连接空闲与执行等待；图形编辑器连接独立于 API 池。

连接耗尽实验：先将 DB_POOL_MAX 临时设为 1 并重启，确认 API 就绪。DBeaver 独立会话中分组执行 `03-hold-lock.sql`，拿到锁后在两个 Postman 标签页接近同时发送列表；从第三会话观察阻塞。预期一个在服务器等待约 3 秒取消，一个在池等待约 2 秒失败，均为 503。随后同一锁会话 ROLLBACK；15 秒空闲事务保护可能已断开该会话，此时重连核对即可。重新 GET 应为 200，恢复 DB_POOL_MAX=5 并重启。实验不写业务行。

## 停止、恢复与产物

停止 API 后 DBeaver 仍可读保存的行；重启后按实际 ID 查询，字段保持。serve 先关闭 HTTP 接收并等待已追踪工作，再调用 app.close；DatabaseService 先断开客户端，finally 结束自有池，部分启动失败也清理。正常日志为 app.draining → database.closed → app.stopped；强制终止不能保证执行关闭钩子。

开发监听、生产构建仍分离。`npm run build` 后 `npm start` 不生成、不迁移、不读 `.env`；由目标环境注入 DATABASE_URL、端口等。生产代码依赖 adapter-pg、pg 和 @prisma/client，保留 dist 下生成的 JS；独立产物目录需带 package.json、lock、.npmrc 与 dist，安装生产依赖。本机检查产物可用 `NODE_ENV=production PORT=3001 node --env-file=.env --enable-source-maps dist/src/server.js`，仅本机核对使用开发秘密，DB_QUERY_DEBUG 必须为 false。正式部署应使用独立数据库与最小权限角色，不能把本机 epp_owner 连接直接发布。

`npm test` 只保留原来的非法 JSON 最小回归；现在先读既有列表，再验证请求被拒绝后结果不变，需要 `.env` 或进程提供开发数据库，运行时停止其他写入。不清空数据库、不建立全套测试工程。旧章节独立 Map 示例仍用其自身内存对象；第十四章数组练习应在第十四章快照中做，不把旧练习补丁套在当前持久化分支。
