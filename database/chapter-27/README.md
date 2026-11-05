# 第二十七章：表达身份与采纳闭环

从 `part-04/chapter-26` 的最终状态继续，完成状态为 `part-04/chapter-27`。沿用 Node 24.22.1、PostgreSQL 18、Prisma 7.10.1，无新增依赖。先读正文的身份规则，再执行迁移；规范化不是相似语义识别。

## 保留旧数据升级

1. 在 DBeaver 核对 DEV／VERIFY 连接，执行 [历史审核](02-history-audit.sql) 的第一条查询。正常前章数据应返回零行。先备份现有目标库；停止包括旧产物在内的全部写入者。
2. 在 Prisma 模型增加 Expression 的 userId、normalizedMeaning、可空 semanticKey，以及 ExpressionForm.normalizedText、expressionId 索引；追加 `20261104160000_expression_identity` 迁移，不修改已应用迁移。同时完成正文27.3的采纳存储与启动检查修改，再运行下一步check；生成客户端不执行迁移。
3. 在项目根目录，先对独立校验库运行：

```bash
nvm use
npm ci
npm run check
npm run prisma:verify -- migrate deploy
npm run prisma:verify -- migrate status
npm run prisma:verify -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

`prisma:verify` 读取 `.env.database-verify`；确认其中 DATABASE_URL 指向 VERIFY。迁移显式事务、单次等锁2秒、语句30秒。遇到孤立表达、多个形式或多个归属用户会主动中止，先核对真实来源，不能用任取一条来掩盖异常。

4. 在同一 VERIFY 连接执行 [结构与数据核对](01-inspect.sql) 和历史审核第二条查询。所有旧 ID、显示文本、创建时间、学习来源与回执JSON保持；每组按 created_at/id 选择最早表达持有复用键，其余旧表达键为NULL。NULL表示保留历史副本，不能据此排除读取。
5. 校验通过后，以同样停写顺序对 DEV 执行 `npm run prisma -- migrate deploy` 和 `npm run prisma -- migrate status`。API 的 `.env` DATABASE_URL 也需核对；CLI成功不证明API连到同一库。
6. 若迁移失败，先读 `_prisma_migrations.logs` 和实际列／函数状态。确认事务已回滚、解除阻塞或完成事实修复后，再执行 `npm run prisma:verify -- migrate resolve --rolled-back 20261104160000_expression_identity`，随后 deploy。resolve只登记历史，不修复数据。不要清库、改旧迁移或在部分升级状态恢复旧写入者。

## 开发联调

`npm run dev` 生成客户端并自动编译到 `.dev`，Inspector仅监听本机9229。VS Code选择 `EPP: attach to npm run dev`；在 `prisma-candidate.store.ts` 的表达查询后观察 identity、expression，在 `candidates.service.ts` 返回前观察完整结果。事务内断点应短暂停留；长时间暂停会影响事务、连接和客户端等待，不用于测量正常延迟。

Postman导入 [本章集合](../../requests/chapter-27.postman_collection.json)，仅本机发送，baseUrl与实际端口一致。按01～17运行：初始修订的A/B规范化相同，C义项不同，D放弃，E未选择；08先追加新修订，再采纳旧修订，核对原来源。09/10表达ID相同、学习记录ID不同；15重放10的原结果，16新身份返回409。01每次建立新样本并重置变量，中断后从下一条继续，不为重试采纳重新执行01。

01～17完成后E仍pending。复制13为独立请求，改URL为candidateE，保存一个新operationId；此额外实验成功后14的初始pending断言不再适用。用 [表达锁实验](03-expression-lock.sql) 的 BEGIN和SELECT，在DBeaver会话A持锁；不要把结尾ROLLBACK一起执行。Postman发送匹配的pending候选，得到503；会话B核对没有采纳、学习记录或回执。A单独ROLLBACK，再用原operationId发送，应201。脚本使用与应用相同的无空格JSON锁键，JSON的语义相同并不代表字符串哈希相同。

`npm test` 只能连接独立校验库：已有回滚用例会临时加CHECK。正常日常操作不需要反复运行整套检查。测试与SQL脚本不进入生产路由。测试连接在根目录 `.env.test` 用 `TEST_DATABASE_URL` 单独提供；缺失时在打开应用前退出，不回退到开发 `.env` 或继承的 `DATABASE_URL`。配置与运行方式见[项目测试说明](../../README.md)。

## 产物与恢复

`npm run check` 后，将dist、package.json、package-lock.json、.npmrc复制到独立运行目录，在该目录使用同版Node执行 `npm ci --omit=dev`。通过进程环境注入该环境DATABASE_URL，运行 `NODE_ENV=production PORT=3001 node dist/src/server.js`；不携带 `.env`，生产默认 `/docs` 为404，无Inspector、无watch。退出并重启，用原operationId复查相同JSON；按candidateId关联查询确认学习记录、来源和表达未额外增加。

启动会检查新增列、表达身份唯一约束与规范化函数。旧版程序缺少新必填列的写入逻辑，不能作为升级后的恢复产物；回退须选择了解新结构的修复产物，或在独立恢复环境验证成套备份。旧回执仍按原公开Schema重放，不根据当前代表重写历史响应。

当前只在固定开发用户内复用完全相同的规范化英文和义项；无登录、账号处置、语义相似推荐或自动合并。每次采纳建立自己的学习记录，复用的只是表达身份。现有表达仍只有一个代表形式，候选原拼写保留在候选中；多种词汇形式的关联与人工合并在后续语义篇建立。
