# 第三十章：从列表到索引迁移

从第二十九章完成状态进入 `part-04/chapter-30`。项目根目录按 `.nvmrc` 切换 Node，沿用既有依赖。准备独立 VERIFY，保留前章虚构采纳和回执。开发用户、分页签名密钥和 HTTP 契约沿用前章。

1. DBeaver 在同一 VERIFY 编辑器分段运行[临时表实验](01-compare.sql)。百行和十万行分别采样；无列表索引、单列、联合三种情况都重跑第 2 步。只执行第 6、7 步的 SELECT 比较同页 ID。断开连接即可清理。
2. 在尚未升级的 VERIFY 保存[行数、索引和首页](02-upgrade.sql)以及[含归属检查的真实查询计划](03-owned-page.sql)。03 按 PREPARE、EXPLAIN EXECUTE、DEALLOCATE 顺序运行，参数对应学习列表 limit=3。它只覆盖该请求的第一条 SQL。
3. 如需重现两万条来源，用前章 VERIFY 的独立副本，库名以 `_ch30_lab` 结尾，至少有一条归属正确的学习记录，尚未应用新索引。DBeaver 开启手动事务，在一个空闲编辑器运行[构造同用户来源](05-rehearse-scale.sql)，然后在**同一个编辑器**粘贴执行 03 的三条语句，单独执行迁移中的 CREATE INDEX，再重复 03。最后 ROLLBACK，或断开该会话并放弃未提交事务。整个练习不要 COMMIT。这个副本只用于观察计划，正式迁移另用 VERIFY。
4. 核对 `.env.database-verify` 指向 VERIFY，在实际迁移目标上停写。运行 `npm run db:verify -- migrate status`、`npm run db:verify -- migrate deploy`、`npm run db:verify -- migrate status`。重跑 02、03，对照原 ID、顺序和新索引定义。若报告失败，先核对锁、实际索引和历史，确认事务已回滚才登记 rolled-back 后重试。日常库按同样步骤单独升级，保持各环境原数据。
5. `npm run check` 后，用指向独立 VERIFY 的 `.env.test` 运行 `npm test`。开发 API 的 DATABASE_URL 也应单独核对。用正文 30.4 的命令从 .env.test 显式取出连接串，覆盖本次开发进程的 DATABASE_URL 并开启查询事件，Postman 新开两个 GET，路径分别为 `/learning-records?limit=1` 与 `/learning-records?limit=3`，按响应 X-Request-Id 数查询事件。沿用[上一章集合](../../requests/chapter-29.postman_collection.json)中的首页、续页和详情时，保留操作身份，只选择需要的读取请求。
6. VS Code 附加开发进程，在 database.service.ts 的 query 回调观察只包含表名、排序、LIMIT 的表达式，取消断点后重新计时。另运行 `node --env-file=.env.test database/chapter-30/04-pool.mjs` 观察[单连接池](04-pool.mjs)由等待 1 回到 0。
7. 交付目录复制 dist、package.json、package-lock.json、.npmrc，执行 `npm ci --omit=dev`，由进程环境提供 DATABASE_URL 与持久 CURSOR_HMAC_KEY，运行 `NODE_ENV=production PORT=3001 node dist/src/server.js`。检查旧详情、星图、分页以及正常停止后用同一密钥续页。迁移在独立步骤完成；已有 API 回退后仍可使用增加索引的库。
