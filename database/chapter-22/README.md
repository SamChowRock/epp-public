# 第二十二章：保留输入修订历史

起点 `part-03/chapter-21` 最终状态，完成分支 `part-04/chapter-22`。撤回第二十一章过渡补丁，停止旧 API、独立旧产物和内容维护写入。沿用 Node 24.22.1、PostgreSQL 18、Prisma 7.10.1、DEV／VERIFY／SHADOW 配置，不重建已有库。

## 迁移与切换

本章使用停写窗口：回填期间和新服务接管前不得运行旧写入者。DBeaver DEV 先查询实际数据库、角色、端口，保存 captures 的全部字段，导出到受控位置，不提交内容导出。

成品已含 `20261102100000_capture_revisions`。审查其建表、锁、回填与逐字段核对：旧 ID 保持，初始修订内容逐字复制，input_source=unknown、chunks=SQL NULL，修订时间为迁移时间；旧 captures 字段不变。新建 Capture 与第一个修订使用嵌套写入，后续只追加修订。

```bash
nvm use
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL
npm run db:verify -- migrate deploy
npm run db -- migrate deploy
npm run db:verify -- migrate status
npm run db -- migrate status
npm run db -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run db:verify -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run prisma:generate
npm run check
```

从前章自行修改时，在 Schema 增加 CaptureRevision 与 Capture.revisions 后用 `npm run db -- migrate dev --name capture_revisions --create-only` 生成草稿；首次应用前补上正文的 SQL，再执行上述部署路径。不要与成品迁移重复生成，不改已应用历史。

在 DBeaver DEV 与 VERIFY 分别执行 [01-inspect.sql](01-inspect.sql)。第 1 版覆盖所有父记录，missing_initial=0，字段差异查询为空。VERIFY 无业务行时得到 0 正常。另对照迁移前导出，确认 Capture 归属、时间、原文和意图全保持；检查约束、关系图及索引，diff 不能代替 CHECK 核对。

失败时维持停写，找首因。事务未提交时应回滚，但仍查实际表和迁移历史；确认整次失败动作已回滚后，按实际迁移名 `migrate resolve --rolled-back`，处理根因再 deploy。已成功历史不改写。迁移锁提交即释放，不能替代停旧写入者。

## 开发与图形请求

运行配置仍单独来自 `.env`，确认与 DEV 是同一实例、库及角色，不能只改 CLI 配置。执行 `npm run dev`，VS Code attach 到本机 9229；保存源码后重编译／重启，数据保留。启动检查新表及缺少修订的 Capture，异常时拒绝就绪，不做静默回填。

导入 [chapter-22.postman_collection.json](../../requests/chapter-22.postman_collection.json)，逐项手动发送。新建成功的脚本仅保存 captureId，不触发后续请求。首次 GET 历史为第 1 版；追加完整内容为第 2 版；旧 PATCH 清空意图产生第 3 版并复制最新原文、来源与 chunks。详情 ID 和 createdAt 属于 Capture，内容属于最新修订。

GET `/captures/:id/revisions?limit=2` 返回倒序历史和 nextBefore；将 nextBefore 填进集合 before，再读取下一页。空页返回 200，父记录不存在返回 404；before 为正整数，limit 默认20、最多100，重复／未知查询参数拒绝。重复点击 POST／PATCH 都可能增加版本，不是幂等操作。

完整修订必须包含 originalText 与 chineseIntent；null 清空意图。inputSource 只接受 manual、缺省 manual；chunks 省略或 null 为未知／未提供，[] 为明确空数组。最多25个仅含 text 的对象，每段至多200 UTF-16单元。原文与意图仍至多2000单元，正文仍至多16 KiB。旧 POST 不接收 chunks，携带片段使用追加接口。

无效内容、未知字段和非法范围应400且不加版本。用本章新建的虚构记录运行 [02-constraints.sql](02-constraints.sql)：替换占位 ID，分步 BEGIN、INSERT，看到23505后单独 ROLLBACK。没有命中任何行不能证明约束正确。用 [03-content-choice.sql](03-content-choice.sql) 对照“历史匹配”和“最新内容匹配”。

并发争用同一序号返回409／REVISION_CONFLICT；读取最新内容后由用户决定是否再提交，不自动覆盖或重试。顺序到达的过期完整快照仍可能成为最新版本，本章不保证基础版本校验。503／断线可能结果未知，先查看历史，不盲目重发。

## 停止、恢复和产物

暂停前记下 captureId、最近序号和迁移阶段，结束数据库事务，停止开发进程。下次连接原库先查历史，不再回填。不删除旧版本，不用旧列代表当前内容。旧字段只是初始副本，已经产生新修订后不能直接回到第二十一章写入协议。

`npm run build` 输出独立产物；运行依赖沿用锁文件，目标环境提供 DATABASE_URL，`npm start` 显式生产模式，不开启 Inspector、不监听源码、默认关闭 docs。迁移由持有固定 CLI 和历史的独立步骤执行，先于开放写入；应用启动不自动迁移。停 dev 后用生产产物 GET 相同记录，核对内容和历史仍在。已有 `npm test` 是最小 HTTP 回归，需要可连接的当前数据库，不能代替版本和迁移核对。测试连接在根目录 `.env.test` 用 `TEST_DATABASE_URL` 单独提供；缺失时在打开应用前退出，不回退到开发 `.env` 或继承的 `DATABASE_URL`。配置与运行方式见[项目测试说明](../../README.md)。

早期 `examples/chapter-14-review.patch` 与 `database/chapter-21/reader-only.patch` 仅用于各自章节起点，回看时使用对应章节分支，不能直接套到修订实现上。没有认证的固定用户实践仍只用于本机；来源字段不构成权限证据。
