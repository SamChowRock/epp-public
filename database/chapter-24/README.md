# 第二十四章 事务与采纳

从 `part-04/chapter-23` 继续，完成分支 `part-04/chapter-24`。Node 24.22.1、Prisma 7.10.1、PostgreSQL 18及DEV／VERIFY／SHADOW配置沿用前章。采纳确认具体candidateId，允许历史修订；不接受本次请求替换内容，不调用模型。

## 迁移与启动

先停旧服务，在DBeaver保存记录、修订与候选原值，再审查新增 `20261103140000_acceptance`。新表expressions、expression_forms、learning_records初始为空；候选增加accepted_at，旧行保持NULL，不伪造采纳。

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

自行从前章编码时，生成create-only迁移后，首次应用前补齐状态CHECK、文本底线、外键、BEGIN／COMMIT与有限超时。使用成品分支不再次生成同义迁移，不修改已应用历史。01-inspect.sql检查列与约束，最后的全零UUID需换成本次candidateId。

## 请求、调试与恢复

导入 `requests/chapter-24.postman_collection.json`，默认baseUrl为3000。手动按01～04建立独立演示记录与pending候选；05采纳201；06重复采纳409；07不能再放弃；08读取原结果；09～11拒绝多余字段、查询和非法ID；12～13核对新版输入不改变旧确认。成功脚本只保存ID，不自动发请求。

`POST /candidates/:id/accept`要求JSON `{}`。一笔事务内检查归属、条件改变pending状态、新建表达／初始形式与学习记录；任何后续失败回滚全部写入。当前每次采纳新建一个表达，不实现语义去重和命令结果重放。历史候选可采纳。其他候选保持原状态，候选序号不释放。

VS Code连接npm run dev的本机Inspector，在PrismaCandidateStore.accept的learningRecord.create处观察claimed.count与expression.id。这时尚未提交，尽快继续，事务有5秒期限。Service收到result后才说明事务Promise完成。源码保存自动重启后用GET恢复，不重复采纳请求。

数据库内确定回滚与HTTP未知结果要区分。500／503或连接中断后，先按revisionId读取状态并在DBeaver关联查询；pending也可能是原请求仍在途。不要自动换candidateId创建新结果。acceptedAt使用应用时钟；模型虽声明createdAt默认值，本章实际Prisma INSERT显式携带该列。两者均不作为全局提交排序或操作身份。

## SQL实验与最小回归

- 02-atomicity.sql：一个连接、Auto-commit，分块逐句执行。第一组故意制造accepted但无表达，第二组BEGIN后失败，先单独ROLLBACK再查pending；第三组成功提交。只操作会话临时表。
- 03-isolation.sql：仅隔离练习库；A/B库名相同但PID不同，交替执行标号块。READ COMMITTED读到10→20，REPEATABLE READ读到10→10，旧快照更新报40001后ROLLBACK。所有事务结束后删除专用chapter24_lab对象。
- 04-savepoint.sql：一个连接，错误后ROLLBACK TO恢复；RELEASE不提交，外层ROLLBACK后count为0。只操作会话临时表。

`npm test`需要独立的、已迁移并含固定开发用户的测试数据库。测试会临时ALTER learning_records加入只拒绝本次样本的约束，验证最后写入失败回滚，再删除约束并验证双请求只有一次成功；结束清理样本。不要对日常或共享数据库运行。已有HTTP读取回归与这项写入回归串行执行，避免互相改变列表。若进程被强制终止，先检查本次测试约束acceptance_test_reject与样本残留，再决定清理；不要删除业务数据或整库reset。测试连接在根目录 `.env.test` 用 `TEST_DATABASE_URL` 单独提供；缺失时在打开应用前退出，不回退到开发 `.env` 或继承的 `DATABASE_URL`。配置与运行方式见[项目测试说明](../../README.md)。

## 独立产物

沿用第十九章：构建dist，复制dist、package.json、package-lock.json和.npmrc到独立目录，`npm ci --omit=dev`，运行环境提供DATABASE_URL后 `npm start`。不复制开发.env，不开Inspector或监听，docs默认404。先迁移再启动，缺新表／列拒绝就绪。重启后按同一revisionId核对accepted及关联事实。

出现accepted行后，23章旧输出Schema不能识别它，直接回退可能导致列表500。保留数据库事实，修复前进或准备兼容读取、关闭新写入的恢复版本；不改回pending、不删除采纳数据、不重写迁移。中断前结束SQL事务并保存相关ID，下次先GET。
