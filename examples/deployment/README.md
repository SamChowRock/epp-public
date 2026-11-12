# 第 57 章　本机进程托管

从第 56 章交接的非空数据库与配对的练习桶起步。本章沿用第 55 章的应用、迁移与请求集合。本章开放 LISTEN_HOST 和 LOCAL_SMTP_HOST，默认均为 127.0.0.1。前者选择 API 的监听 IP，后者供邮件 Worker 连接私有练习收件端。API、两个 Worker 和 CLI 都由 Node 在前台直接运行。以下是本机部署工具，均从配套项目根目录使用。

1. 在本次独立 PostgreSQL 实例创建非所有者登录角色 epp57_run，交互设置密码。以业务表所有者连接目标库，在 psql 设定独立记录的库名（如 `\set expected_db epp_ch57_handoff`），运行 `\i examples/deployment/runtime-grants.sql`。脚本只向这个角色追加授权。用新建角色，并确认它没有通过所有权、PUBLIC 或角色继承取得 DDL 权限。
2. 依第 54 章制作生产目录，放入部署根的 release。另建私有 config、work 和 logs 目录。Linux 和 macOS 分别在目标平台安装生产依赖。源码与迁移工具留在构建和迁移环境。
3. 在 config 新建 0600 的 api.env、mail.env、notifications.env。每份都有本轮运行角色的 DATABASE_URL、NODE_ENV=production 和 DB_POOL_MAX。API 增加 PORT、APP_ORIGIN、稳定的 CURSOR_HMAC_KEY 与第 51 章的四项 AVATAR_S3 配置；mail 增加 LOCAL_SMTP_PORT。通知进程只需公共三项。
4. 在配套根目录用 nvm use 选好 Node，执行 `node examples/deployment/launch-agents.mjs "$deploy" "$db"`。两个参数分别是部署根和来自建库记录的预期库名。生成器取当前 Node 的绝对路径供 launchd 启动进程，并用 Node 写出供 macOS 宿主选用的 XML 配置。生成器新建 agents，不覆盖已有目录。生成内容只含路径、参数和策略，秘密由 Node 在启动时从受限文件读取。先以同一环境运行账号 CLI 的 receipt，再加载 API。
5. 在本机登录会话用 `launchctl bootstrap "gui/$(id -u)" "$deploy/agents/local.epp.ch57.api.plist"` 加载；另两份替换末尾文件名。邮件需要明确 `launchctl kickstart "gui/$(id -u)/local.epp.ch57.mail"`。正常维护用 bootout 卸载本次标签。默认生成到部署根，登录时自动加载需另行将文件安装到对应账号的 Library/LaunchAgents。
6. 配置文件改动在下一次启动时读取。要修改 plist，请先卸载已注册且归属本轮的任务，将 agents 改为未使用的归档名，重新生成、校验并加载。旧的配置文件及相应 Node 路径也须保持可用，才能用旧 plist 回退。

API 和通知异常退出时可重新拉起。邮件角色任何退出都停下，由维护者核对通道状态后再决定是否启动。三个任务共用本机用户身份；希望操作系统隔离不同角色时需分别分配身份和目录。管理员在系统域长期运行时还应确认数据库和存储的开机托管、监督启动失败、日志轮转与停发告警。
