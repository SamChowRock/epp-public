# 第二十三章 候选状态与关系

从 `part-04/chapter-22` 继续，完成分支 `part-04/chapter-23`。使用 Node 24.22.1、PostgreSQL 18、Prisma 7.10.1，沿用 DEV、VERIFY、SHADOW 配置。已有修订保持原值，没有候选就是零条子记录。

## 追加迁移

先停止开发服务，保留数据库。成品包含 `20261103090000_candidates`；不要再次生成同义迁移。先在 DBeaver 保存记录与修订的查询结果作对照，再执行：

```bash
nvm use
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL
npm run db:verify -- migrate deploy
npm run db:verify -- migrate status
npm run db:verify -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run db -- migrate deploy
npm run db -- migrate status
npm run db -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run check
npm run dev
```

自行从前章编码时，添加 Candidate 模型及 CaptureRevision.candidates，执行 `npm run db -- migrate dev --name candidates --create-only`；首次应用前补齐本章 CHECK、BEGIN/COMMIT 与超时，再应用。已成功迁移不可修改；本章只建候选表，不回填旧修订，不迁移学习记录或表达表。

在 DBeaver 使用 `01-inspect.sql` 核对实际库、约束和关系；`02-state-shape.sql` 分块执行，仅操作当前会话临时表。第一段故意失败后立即单独 ROLLBACK；第二段证明 CHECK 不禁止反向转移，最后也 ROLLBACK。

## 图形请求与调试

导入 `requests/chapter-23.postman_collection.json`。默认 baseUrl 为 `http://127.0.0.1:3000`。按01～16手动发送；成功脚本仅保存 ID，不自动发下一条请求。01～02取得本章独立记录和修订；04～05保存两份候选；07首次放弃200；08重复放弃409；09复用序号409；12追加修订并保留旧 revisionId；13新版本为空、14旧候选仍可读。不要把整套集合反复自动运行当作恢复操作。

每版 candidateNo 为1～5，空位可逐个填写，放弃后也不释放位置。内容不可编辑；本章不调用AI、不采纳、不重开。所有候选读写通过修订与记录检查固定用户归属。旧版允许补候选和放弃，这不构成旧版可采纳的承诺。GET返回全部至多五条，包含已放弃项；不支持查询参数。

VS Code 连接现有本机 Inspector，在 `CandidatesService.discard` 的结果判断、`PrismaCandidateStore.discard` 的 `rows[0]` 和 `ResponseSchemaInterceptor` 的 map 回调处停住，观察首次有返回行、再次候选存在但变更行为空。及时继续，不把断点暂停造成的客户端超时当作未提交证明。编辑保存后等待自动编译和重连，先发GET再决定是否继续写。

## 生产与中断恢复

`npm run check` 生成生产 dist；沿用第十九章独立产物步骤，复制 dist、package.json、package-lock.json、.npmrc，在独立目录 `npm ci --omit=dev`，由运行环境提供 DATABASE_URL，执行 `npm start`。不携带 .env，不开 Inspector或源码监听，默认 docs关闭。迁移由部署步骤先执行，应用启动探测候选表，缺表拒绝就绪。已有最小检查仍用 `npm test`，它需要已迁移且含固定开发用户的隔离数据库。测试连接在根目录 `.env.test` 用 `TEST_DATABASE_URL` 单独提供；缺失时在打开应用前退出，不回退到开发 `.env` 或继承的 `DATABASE_URL`。配置与运行方式见[项目测试说明](../../README.md)。

本章新增表不改变22章的读写含义，但22章程序不提供候选路由。回退应用不删表、不撤销放弃，也不启动21章旧写入者。故障先查候选列表、当前状态及迁移历史。503或连接中断后不自动换序号重建；占位409不提供原请求结果重放。停下时保存四个ID、结束SQL事务；继续从GET恢复，而不是再次执行01、04或07。
