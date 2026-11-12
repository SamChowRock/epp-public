# 第三十三章：分页、游标与日期边界

从 `part-04/chapter-32` 到 `part-04/chapter-33`，保留现有模型与迁移，无新增依赖。先在项目根目录执行 `nvm use`、`npm ci`、`npm run check`，用 `npm run db -- migrate status` 或VERIFY的对应命令核对目标；不reset、不重建已有数据。API运行连接与CLI配置仍分开。

开发沿用 `npm run dev`、本机Inspector9229和VS Code附加。新增配置CURSOR_HMAC_KEY是64位小写十六进制随机值；用 `node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"` 生成一次，保存到已忽略的.env，不覆盖已有字段、不提交或截图。开发／测试未配置时每次创建应用使用临时密钥，重启后游标失效；生产必须由进程环境提供持久密钥，缺失则在监听前拒绝启动。所有实例使用同一值，轮换会使旧游标失效。

两个列表仍是 `GET /learning-records` 与 `GET /star-map`。不传mode保持旧响应；显式mode=offset增加nextOffset，显式mode=cursor增加nextCursor。详情不变。limit默认20、最大100；offset仅offset模式接受，范围0～10000且不接受前导零；cursor仅cursor模式接受。重复、未知或混合参数400。nextOffset在末页或达到页深预算时为null，hasMore仍可为true；此时收窄范围或从Cursor首页开始。

from包含、to排除，必须是 `2026-11-04T16:00:00.000Z` 这样的三位毫秒UTC时间，年份0001～9999，允许缺省一端，双端必须from＜to。学习列表按学习createdAt筛选，星图按表达createdAt筛选；星图recordCount仍计全部可见来源。expressionId只对学习列表开放。

Cursor保存时间／ID双字段边界，绑定资源、用户、排序、实际limit、expressionId和日期范围。整轮遍历30分钟内有效，不逐页续期。条件变化、过期、损坏、换密钥返回400／INVALID_CURSOR，清除cursor重取首页。它不冻结跨请求快照，不是授权凭证，也没有加密内容；不要记录游标、密钥或原始查询URL。

签名对应本接口“只接受服务端签发且不可改的上下文”这一选择，不是键集分页或用户隔离的必要条件。允许客户端选择合法边界的接口可以不用签名，但仍须逐页校验输入与数据归属。当前有效游标可重复使用，不限制请求频率或累计费用。30分钟是自定期限，当前没有分页会话需要回收；格式升级若依赖过期淘汰，必须安排新旧解码兼容，并从停止签发旧格式时计算窗口，不能仅凭expires字段断言无缝升级。实现与既有调用契约保持不变。

导入[Postman集合](../../requests/chapter-29.postman_collection.json)。01～11建立虚构输入并采纳A／B／C，D保持pending；12核对旧结构，13保存Cursor首页，14读Offset首页，15采纳D插入队头，16与17比较两种下一页。18改limit、19损坏游标返回400；20／21用单独starCursor翻星图；22日期范围、23非法日期、24原详情。集合按这些步骤使用，不盲目重复整组。过期后从13重取边界，已保存的操作身份保持；日期请求范围内无数据可以正常空集。

DBeaver连接独立VERIFY，逐段运行[位置与边界](01-page-boundaries.sql)。临时表同一连接中预期4／3→Offset3／2→Cursor2／1，删除边界行仍2／1；最后ROLLBACK。此处单连接模拟位置变化，真实两次HTTP读取间的提交由Postman完成。再运行[自然日](02-natural-day.sql)，预期上海24小时，纽约示例23／25小时，四个边界包含标记false／true／true／false；全部只读，不改业务时间。

VS Code在learning.queries.ts的list返回行暂停，观察rows.length、page.limit、page.where与最后实际返回项；不要展开cursorKey。pageResult用rows[limit-1]，多取的下一项不作为边界。继续后对照Postman，若字段内部存在而响应消失，检查两个输出Schema是否都声明了续页字段。开发保存源码后确认自动重启；固定密钥时可继续旧游标，否则重新开始。

自动回归只对隔离校验库：.env.test显式TEST_DATABASE_URL，先应用本章所需既有迁移并建立固定用户。`npm test`不回退DEV，测试含临时写入与删除边界样本，暂停该校验库其他写入；清理沿已有事务规则保留共享表达。

独立交付目录仅复制dist、package.json、package-lock.json、.npmrc并 `npm ci --omit=dev`。通过进程环境提供DATABASE_URL与CURSOR_HMAC_KEY后运行 `NODE_ENV=production PORT=3001 node dist/src/server.js`，默认docs404、无Inspector／watch。核对旧详情和回执、旧请求结构，再取Cursor首页、正常停止、用相同密钥重启并续页。模型无变化，回退旧代码不会回滚数据库，但旧代码不接受分页新参数；调用方需要一起协调。
