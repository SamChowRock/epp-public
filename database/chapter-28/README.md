# 第二十八章：面向客户端的有界查询

从 `part-04/chapter-27` 继续到 `part-04/chapter-28`。本章不改变Prisma模型、既有迁移或数据，不新增依赖；已有27章数据库可直接被新查询读取。仍为固定开发用户，无真实登录。先确认目标是自己的DEV或独立VERIFY；不要用清库制造空列表。

在项目根目录运行 `nvm use`、`npm ci`、`npm run check`。数据库CLI用 `npm run db:verify -- migrate status` 核对VERIFY，读取 `.env.database-verify`；DEV对应 `npm run db -- migrate status`，读取 `.env.database`。首次独立建库才按既有流程deploy并建立固定开发用户。本章没有新迁移需要生成。API自己的 `.env`／进程配置仍需指向相同目标。

`npm run dev` 自动编译与重启，Inspector仅监听本机9229。VS Code附加已有 `EPP: attach to npm run dev` 配置，在 `learning.queries.ts` 的list查询返回后观察rows.length、limit和公开投影；运行日志只保留固定路由标签，不打印ID、查询值或原文。

导入[本章Postman集合](../../requests/chapter-28.postman_collection.json)。01～11沿已有写入入口准备样本，并在旧修订采纳A/B/C；12～21核对星图节点、记录上限、按表达筛选、历史详情、空结果、重复／未知参数与非法ID。01重新执行会创建新样本并更新集合变量；重试查询无需重跑准备请求。12 只检查星图首页的上限和可见节点。复用的旧表达可能在首页之外；14 按表达 ID 查本轮 A、B 的两条来源。只查看原有星图可直接使用 12；详情ID必须来自learningRecord，不是candidate或expression。

- `GET /star-map?limit=20`：每个表达身份一个节点，recordCount为可见采纳来源数；无语义边、坐标或掌握等级。
- `GET /learning-records?limit=20&expressionId=...`：每次采纳一个items元素，expressionId可省略，过滤先于截取。
- `GET /learning-records/:id`：附带当时修订与候选内容，不跟随Capture的最新修订。

两个列表默认20、最大100，按各自资源createdAt降序，再按UUID降序。limit只接受1～100的十进制字符串；重复／未知参数400。hasMore来自多取一行，没有total或下一页游标；下一章继续分页。未知或无权读取的详情404；未知或无权读取的expressionId筛选得到200空列表。不要把空列表用于证明全库为空。

在DBeaver执行[关系观察SQL](01-read-model.sql)，比较学习来源行数与表达节点数。查询不得以semantic_key非空为条件排除旧副本。需要验证多个用户时只在隔离库使用虚构样本；不能把请求中的userId当作当前身份。自动检查 `npm test` 也仅连接隔离校验库。测试连接在根目录 `.env.test` 用 `TEST_DATABASE_URL` 单独提供；缺失时在打开应用前退出，不回退到开发 `.env` 或继承的 `DATABASE_URL`。配置与运行方式见[项目测试说明](../../README.md)。

最后使用独立目录的dist、package.json、package-lock.json、.npmrc执行 `npm ci --omit=dev`，通过进程环境提供DATABASE_URL，以 `NODE_ENV=production PORT=3001 node dist/src/server.js` 启动；生产默认docs404，无Inspector／watch。核对旧学习ID详情、原采纳回执和新查询，重启后结果保持。新读接口失败时通过X-Request-Id和安全错误码定位，不返回假空列表掩盖数据库故障。
