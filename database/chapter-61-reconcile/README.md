# 第61章：只读清点与离线对照

从第60章的同一 VERIFY 数据库、`avatars` 桶和原账号继续。这里新增的是独立观察身份与只读工具；应用继续用原 `AVATAR_` 配置。工具不会上传、撤回或删除对象，也不会更新业务行。所有命令在源码根目录运行，Node 使用本书固定的24.22.1；依赖已在第60章安装，不增加工具包。

## 1. 管理员先建立观察身份

先核对机器和库。在独立 VERIFY 的管理员 psql 会话执行 `SELECT current_database(), current_user, inet_server_addr(), inet_server_port();`，与第60章连接配置逐项对照。下面把 `YOUR_VERIFY_DB` 换成实际库名；连接通过原管理员的私有配置提供，不在命令行放密码。

```sh
psql -X -v expected_db=YOUR_VERIFY_DB -f database/chapter-61-reconcile/readonly.sql
```

脚本先检查实际库名，创建无初始密码的独立 `epp_avatar_auditor` LOGIN，再仅授予本库 CONNECT、public USAGE、users 的 id/avatar_id 和 avatar_writes 的 id/user_id/state/created_at/check_after 列 SELECT。重跑遇到同名角色会失败并回滚，不覆盖已有身份。随后重新进入**同一核对过的库**的管理员 psql 会话，用 `\password epp_avatar_auditor` 交互设置随机密码。不要把观察角色授予 API、Worker 或维护角色。

使用 DBeaver 时，先执行同一身份查询，确认数据库无误后，在事务内逐条执行 SQL 文件中 BEGIN 至 COMMIT 的原生 SQL（将 `:"expected_db"` 替换为双引号包裹的实际库名）；文件中的 `\set`、`\if`、`\gset`、`\password` 是 psql 命令，不粘贴进 SQL 编辑器。密码通过连接管理界面或 psql 交互设置。该权限方案以第60章隔离库的 PUBLIC 默认权限为前提；还须以观察账号验证 SELECT 指定列成功、读取 nickname 等未授权列及 INSERT/UPDATE/DELETE 被拒绝，不能仅凭授权语句推断权限结果。

对象观察账号使用单独的 List:avatars、Read:avatars，应用原账号保持不变。本机 SeaweedFS 实验先在原前台终端 Ctrl-C，等待退出并确认第60章的十个端口无监听。保持停止，且不要同时修改配置。在**持有原 `.chapter51-store` 的工作目录**运行：

```sh
node database/chapter-61-reconcile/init-observer.mjs http://127.0.0.1:18633 avatars
sh database/chapter-51/start-store.sh
```

启动命令留在前台；其他操作另开终端。辅助程序只适用于单用户本机实验，核对 admin.env 端点与桶，检查全部端口已停，拒绝已有观察身份、私有目录或暂存输出；它原子追加身份，保留已有身份内容，写 `.chapter61-private/s3.env`（目录0700、文件0600）。应用与管理员凭据不更换。中途失败先阅读安全错误码，检查现有文件，勿删除身份后重跑或自行轮换应用凭据。其他部署由管理员按当地对象服务建立相同只读权限；不要使用此本机初始化脚本。

在 `.chapter61-private/db.env` 私有文件写入 `RECONCILE_DATABASE_URL=...`，使用新观察账号、原 VERIFY 主机/端口/库；密码包含特殊字符时按 PostgreSQL URL 编码。文件设0600，目录0700。不要用数据库所有者或应用连接替代。

## 2. 分别观察两个系统

另开终端，仍在源码根目录。`YOUR_VERIFY_DB` 必须是你独立核对的库名，不能从 URL 自动抄取来充当核验。每轮使用新的结果文件名：

```sh
umask 077
node --env-file=.chapter61-private/db.env database/chapter-61-reconcile/inventory.mjs db YOUR_VERIFY_DB .chapter61-private/db-01.json 100
node --env-file=.chapter61-private/s3.env database/chapter-61-reconcile/inventory.mjs objects http://127.0.0.1:18633 avatars avatars/ .chapter61-private/objects-01.json 100 10000
node database/chapter-61-reconcile/compare.mjs .chapter61-private/db-01.json .chapter61-private/objects-01.json .chapter61-private/report-01.json
```

数据库使用单次 REPEATABLE READ READ ONLY 事务，按 UUID id 键集分页读指定列；记录数据库时钟、真实连接身份、两表每页起止与终页。每页1～1000行，默认100，每表最多10000页，两表共最多1000000行；单句15秒，锁等待2秒，空闲事务20秒，连接5秒。异常保留已读行，`complete=false` 并非零退出。

对象扫描固定 `avatars/` 前缀，每页1～1000个，最多10000页、1000000个唯一键，每请求15秒且不自动重试。保留每页数量/时段、最后一页标志、精确键、大小、lastModified 与 ETag；ETag 不当校验和。续页令牌不透明，直接交回 SDK，不解析、不打印、不保存。令牌缺失/循环、权限/网络错误、达到页数或行数上限均不完整；空列表的明确终页才表示完整空扫描。去重仅按完全相同的键，若清点期间同键改变，保留最后一次观测，页数原样保留。

打开本机 `.chapter61-private/report-01.html` 查看静态表，无脚本或远程资源。JSON 保留两侧来源、观察区间、完整性、行与原观察记录。文件可能含用户ID和对象名，应按私有数据保存；勿提交、公开分享或把私有目录加入静态网站。工具拒绝覆盖；HTML已存在时JSON可能已新建，失败后用新文件名重跑。

离线比较只能检查已知格式和范围；**操作者必须先核对报告中的数据库来源与对象端点/桶确属第60章同一实验**。不同系统没有共同快照ID，工具不能证明这对系统业务上属于彼此。格式不符、重复行、非法ID或非 avatars/ 键直接拒绝。比较还核对各来源页序、时间区间、终页标记与 complete/error 的一致性；数据库页数量之和必须等于保留行数，对象页数量之和允许大于按精确键去重后的数量。缺少完整终页证据或页记录自相矛盾时拒绝比较，不推断缺件。

## 3. 从差异回到同一用户和精确键

`current-listed` 表示数据库样本中的当前头像在扫描中出现；`current-not-listed` 仅在对象完整扫描时使用，也不等同于 HEAD 404。不完整扫描为 `current-unverified`。非当前但有尝试记录的键按 writing/retired/live 保留状态；对象只有在数据库完整时才能称 `object-untracked-at-db-sample`，数据库不完整为 `object-db-unverified`。用户表不完整时，有尝试记录但未观察到当前引用的键保留为 `tracked-current-unverified-状态`，不声称它已非当前。分类是样本事实，不是清理授权。

对当前样本中的 UUID 单独 HEAD：

```sh
node --env-file=.chapter61-private/s3.env database/chapter-61-reconcile/inventory.mjs head http://127.0.0.1:18633 avatars YOUR_AVATAR_UUID
```

只接受规范小写UUID，固定访问 `avatars/UUID.webp`；成功输出 present，404 输出 missing，403及网络/超时等输出 unverified 并非零退出。输出仅有状态、观察时间、安全错误码，不生成URL或泄露配置。非规范键保持原样出现在报告中，不把它转小写或套入UUID HEAD命令。

并发发布时，旧数据库样本加新对象只表示“数据库取样时未追踪”。按同一用户、同一精确键重新取数据库与对象观察，必要时查看原 API 当前头像；仍无法解释就保留，交人工核对。全过程没有跨系统事务，没有对象多页快照，也没有自动修复或删除入口。现有第60章清理程序属于另一项有业务约束的操作，不能把本报告当作其候选输入。

## 验证工具本身

```sh
node --test test/object-reconcile.test.mjs
npm run check
```

定向测试通过注入客户端模拟分页协议/权限与连接失败，并验证离线比较和私有文件不覆盖。它们不代替真实 PostgreSQL 权限验证、真实对象服务 List/HEAD 或原 API 联调。
