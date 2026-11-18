# 第 70 章　服务身份与授权

从第 69 章已在前台运行的 API、非空库、配对对象存储和旧账号接手。代码使用 Node 24.22.1、PostgreSQL 18，原[请求集合](../../requests/chapter-51.postman_collection.json)保持可用。三个 unit 安装在支持 systemd 的独立 Linux 练习目标。Mac 可作为 SSH 操作端。

1. 在构建目录执行 `nvm use`、`npm ci`、`npm run ci:check`。先停止旧消费者，按[备份与独立恢复](../../database/chapter-22/backup-restore.md)保留非空库，将 .env.database-verify 指向本轮目标的迁移所有者。核对旧账号、旧收据、桶和邮件通道。
2. 用 `env -u DATABASE_URL node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch72_handoff` 升级，库名换成交接单中的名称。空库使用 bootstrap。新增的[带锁视图](../../prisma/migrations/20261112010000_notification_recipient_lock/migration.sql)由有权锁定 users 的可信所有者创建。应用不需要当表所有者。
3. 在该独立实例中新建普通 LOGIN 角色 epp_api、epp_mail、epp_notify，分别用 psql 的 `\password` 设置口令，不加入旧运行角色。以表与视图所有者从配套根连接目标库，先执行 `\set expected_db epp_ch72_handoff`，再执行 `\i examples/service-roles/grants.sql`。[授权 SQL](grants.sql)需要先有这三个角色；它只追加列出的权限。若复用有额外授权的角色，须另行核对继承、所有权和已有 ACL。
4. 由 Linux 管理者建立不允许交互登录的 epp-api、epp-mail、epp-notify 用户及各自同名组。为目标平台安装 Node 至 /opt/epp72/node，向新的 /opt/epp72/release 安装 dist、package.json、package-lock.json、.npmrc 和同平台按锁安装的生产依赖。交付文件由 root 拥有，运行账号可读、不可改。/etc/epp72 下三个 .env 均为 root:对应服务组、0640；API 监听 `[::1]:3374`（`LISTEN_HOST=::1`、`PORT=3374`），APP_ORIGIN 保持客户端看到的来源，使用原对象配置，邮件只需数据库、日志与本地 SMTP 配置，通知只需数据库及日志配置。每份连接串使用本角色的独立库身份。
5. 将 [API](epp72-api.service)、[邮件](epp72-mail.service)、[通知](epp72-notify.service) 定义安装到 /etc/systemd/system/，按实际部署修改绝对路径及 Worker 的 EPP_DATABASE。先 verify、daemon-reload，再 start API 和通知。检查通道开放、旧发送者已退出、收端为本轮 Mailpit，并核对积压消息后再启动邮件。API 的私有工作目录由 StateDirectory 建立。用 ps 与 pg_stat_activity 对照系统及库身份。
6. 单发 05、20，原账号可读；15、24 可核对 API 暂存与预览。另一个环境单发 01，在 Mailpit 收信，02 确认，按 userId 和 job ID 对照 done 与 notifications 同 ID 行。以 epp-notify 读取 mail.env、以 epp_mail 更新 users 昵称均应拒绝。故障对照只撤去 epp_notify 在 notifications 上四列的 INSERT，另注册一人，停通知消费者后核对 pending 与空收件箱，再只补回原列授权并重启该角色。
7. 保留已有 unknown 的原始事实；查明、停妥发送者后按[人工处置步骤](../../database/chapter-45/README.md)决定后继。单笔邮件程序可以直接使用 mail.env。测试结束只停止本轮三个单元。下一次打开该库时先核对通道、旧收据与角色，避免重复初始化。

开发入口仍为 npm run dev、npm run dev:worker，生产分别运行 dist/src/server.js 与 dist/src/mail-worker.js；通知入口另加 notifications 实参。完整回归使用单独的空库按[固定用户与测试入口](../../database/chapter-53/README.md)引导和验证。

使用[分角色交接说明](../portable-release/README.md)记录制品、只读收据身份、依赖地址和工作目录，带原会话复核头像。

第66章新增 `capture_integrity_cases`：API 只读 id/capture_id/state，以识别不完整素材；不授予案件写入、扫描或修复依据读取。升级先由迁移角色部署新迁移，再执行更新后的 grants.sql；旧运行身份不得因探针失败而提升为所有者。
