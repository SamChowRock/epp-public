# 第二十八章 并发控制

从 `part-04/chapter-27` 继续到 `part-04/chapter-28`。Node 24.22.1、Prisma 7.10.1、PostgreSQL 18、固定用户与DEV／VERIFY／SHADOW入口沿用。数据库日常操作使用DBeaver；SQL脚本按标号块在两个独立连接交替执行，不能全选运行。

## 先审核旧数据，再收紧约束

停止全部旧写入口。在DBeaver运行01-inspect.sql前两条重复查询，核对每个candidate_id的学习记录、表达、用户和候选状态；零行才可进入迁移。若有重复，先查来源、引用与业务含义并形成具体修复方案，不按最小ID或时间机械删行，不对日常库做reset。SQL末尾全零UUID换成本次实际candidateId。

本章只增加learning_records(candidate_id)唯一约束，没有内容回填、删除或状态重置。Prisma中candidateId加@unique，Candidate.learningRecord变为可空单项关系；HTTP没有使用原复数反向字段，响应不变。第27章正常采纳路径与新约束兼容，但恢复到24会失去本章等待、重试和约束就绪检查。

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

自前章编码时按第20章create-only方式生成迁移，并在首次应用前补BEGIN／COMMIT、lock_timeout与statement_timeout；成品分支直接部署随附迁移。不要重写已应用历史。启动检查会核对指定名称、即时且已验证的单列唯一约束，缺少时记录ACCEPTANCE_CONSTRAINT_MISSING并拒绝就绪。

迁移失败先核对首因：重复值23505、锁等待55P03；带显式事务时CLI也可能只留下25P02／current transaction is aborted，回看数据库日志或在隔离库复现首条失败语句。核对实际结构、失败历史和原行后，修复原因；仅在确认整笔回滚后才执行 `npm run db -- migrate resolve --rolled-back 20261104090000_single_acceptance`，再deploy。resolve是历史登记，不是数据修复。

## 图形请求与调试

导入requests/chapter-25.postman_collection.json，baseUrl默认3000。手动01～04建立新样本，05采纳201，06重复采纳409，07放弃已采纳候选409，08读取原结果。09～13沿用输入拒绝及历史候选核对；脚本只保存ID，不自动发送请求。不同候选的相同文字当前仍产生不同表达。

观察锁超时：先建立新的pending候选，DBeaver独立连接BEGIN后SELECT该候选FOR UPDATE，保持连接；Postman采纳约一秒后503。DBeaver单独ROLLBACK，GET核对pending与关联行，再手动采纳201。实验不把断点或人工等待放进正常请求。

VS Code连接npm run dev，在PrismaCandidateStore.accept的catch入口、错误码判断和事务回调开头查看error.code与attempt。不要逐步拖住一个正在持锁的事务：lock_timeout为每次获取锁1秒，maxWait为申请事务2秒，timeout为每次事务5秒；这些不是整个HTTP的统一5秒截止。仅P2034从事务外退避25～49／50～74毫秒后重跑，最多3次；55P03直接映射503。P2002、P2028、断连和未知错误均不自动重试。Service断点确认事务Promise已完成后再观察最终响应。

## 分块SQL实验

在独立练习库（可用VERIFY）打开A/B两个SQL编辑器，先各执行current_database()、pg_backend_pid()：库相同、PID必须不同。保持Auto-commit模式，但每个标号块用明确BEGIN／COMMIT／ROLLBACK划定事务。语句失败后单独ROLLBACK；不要把错误、回滚和验证一起整段发送。

- 02-races.sql：一次创建chapter25_lab；A1、B1、A2、B2产生同一候选两条结果。A3、B3、A4、B4则由pending条件使B返回零行。
- 03-locks.sql：A持有行锁，B普通读仍成功；UPDATE等待超时、NOWAIT失败、SKIP LOCKED空结果分别观察。A保持原锁；B最后开启30秒的观察等待，第三个空闲会话用pg_blocking_pids查询等待链。A释放后B也回滚。
- 04-deadlock.sql：先A1、B1，再A2挂起，立即到B2构成循环；某一方40P01，双方分别ROLLBACK。stmt_timeout=10s只是实验兜底，若先57014则本轮没有复现死锁，缩短切换时间后重做。
- 05-advisory.sql：A取得事务建议锁，B的try返回false；A结束后B重试true。false不是异常，不能忽略后继续业务写入。A/B共享锁同时true；B释放自己的共享锁后申请排他锁false，A结束后才true。用于讨论生命周期门闩，不接入当前HTTP。
- 06-version.sql：按支线28A依次看到version4、过期更新零行、内容回到first但version5。所有实验结束后再运行末尾清理；没做支线则只清理result、decision和schema。

脚本只操作专用实验对象。中断后先结束所有实验事务、检查对象和行，不重复执行CREATE；要重做则仅清理专用对象并重新setup。连接断开不停止数据库服务。

`npm test`使用独立已迁移的测试数据库与固定开发用户。沿用前章末步失败回滚、双采纳只成功一次，新增唯一冲突与有限重试检查。会短暂增加仅拒绝本次样本的CHECK，不能对日常库运行。真实死锁的错误类型与单元层重试次数是两种证据，不互相代替。测试连接在根目录 `.env.test` 用 `TEST_DATABASE_URL` 单独提供；缺失时在打开应用前退出，不回退到开发 `.env` 或继承的 `DATABASE_URL`。配置与运行方式见[项目测试说明](../../README.md)。

## 交付与恢复

先迁移再启动。构建dist后将其与package.json、package-lock.json、.npmrc复制到独立目录，npm ci --omit=dev；运行环境提供DATABASE_URL，再npm start。不开Inspector和源码监听，不加载开发.env，docs默认404。按保存的revisionId核对已有accepted，重启后继续读取。

503、连接断开或未收到响应时先读取候选和关联事实，不自动另建候选重发。pending快照也不证明原请求已经结束。第29章再建立命令身份与结果重放。锁不能代替权限条件；行锁、建议锁都不负责语义去重或跨服务原子性。
