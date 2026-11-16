# 目标环境与可选 Mac 托管

第 70 章从第 69 章已验的 release 和运行配置起步，将程序交给目标平台，必要时安装该平台的生产依赖。SSH、数据接手与前台运行按正文完成；第 71 章一次建立最终的服务身份和 systemd 托管。这里的 runtime-grants.sql 供临时运行角色授权，也供 Mac 路线使用。

以下本机目录与 launchd 操作供选择 Mac 托管的支线 70B。配置中的库、桶和账号来自第 69 章的独立交接环境。

1. 取交接记录里的实际库名、旧账号 ID、原收据 ID，以及与练习库配对的头像桶。用实例管理员创建普通登录角色 epp57_run 并在 psql 用 `\password epp57_run` 设置口令。以业务表所有者连接目标库，从配套仓库根在 psql 执行 `\set expected_db epp_ch56_handoff`（替换为实际库名）和 `\i examples/deployment/runtime-grants.sql`。以运行角色核对收据表可读取和追加，改写旧收据应遭拒绝。[授权脚本](runtime-grants.sql)
2. 在 Mac 的 Bash 设定 `release` 为已验程序的绝对路径，`deploy` 为这次运行目录的绝对路径，`db` 为实际库名。按正文在 release 以外准备模式 0700 的 config 和 work。将 api.env 放在 config，模式 0600。填写 NODE_ENV=production、epp57_run 的 DATABASE_URL、DB_POOL_MAX、回环端口 PORT、实际 APP_ORIGIN、稳定的 CURSOR_HMAC_KEY 和原桶的四项 AVATAR_S3 配置。
3. 在已选择项目 Node 版本的 Bash 中运行下面的命令，两个 ID 从第 69 章交接记录取得。同一份配置先供管理命令读原收据，再供前台 API 读取。

```bash
node_bin=$(command -v node)
run_with_api_config() {
  (cd "$deploy/work" && /usr/bin/env -i "$node_bin" \
    --env-file="$deploy/config/api.env" "$@")
}
user_id='替换为旧账号UUID'
op_id='替换为原暂停收据UUID'
run_with_api_config "$release/dist/src/account-admin.js" "$db" receipt "$user_id" "$op_id"
```

核对原收据后执行 `run_with_api_config "$release/dist/src/server.js"`。原账号登录，先读本人资料，再发一次头像预览，检查 work/.avatar-tmp 的属主、模式。签发并实际打开旧头像，保留字节摘要。Ctrl-C 后观察 app.stopped、退出码与监听释放。第 70 章在目标机直接交付这份程序。若换成 Debian，从该 release 取 dist、package.json、package-lock.json 和 .npmrc，在目标平台按锁安装生产依赖；已有验过的同平台整包则按原摘要交付。

第 70 章代码分支还提供可选的 LISTEN_HOST 和 LOCAL_SMTP_HOST，两者默认均为 127.0.0.1。需要更换监听地址或练习收件主机时，再构建并验收含这些配置的版本。第 70 章的回环入口可继续运行最初的第 66 章产物。

## 支线 70B　在 Mac 托管服务并追查意外退出

若 Mac 本身需要在关闭终端后继续服务，按支线准备同级的 release、config、work、logs，并给邮件和通知分别准备 0600 的 mail.env 和 notifications.env。通知仅需生产模式、数据库连接和池上限。邮件还需确认 Mailpit 的 SMTP 端口和通道可投递。

在配套根目录使用选定的 Node 执行 `node examples/deployment/launch-agents.mjs "$deploy" "$db"`。生成器在新建的 agents 目录写入三份 plist，路径与参数可用 plutil 检查，密码仍在各自的配置文件中。用 `launchctl bootstrap "gui/$(id -u)" "$deploy/agents/local.epp.ch57.api.plist"` 加载 API，另两份替换文件名；在先前登记的任务上直接检查状态。API 和通知异常退出可重新启动；邮件需明确启动，投递结果未知时保留停发。结束练习时按实际标签逐一 bootout。三个任务在同一 Mac 账号下运行，第 71 章再拆分系统身份。[任务生成器](launch-agents.mjs)
