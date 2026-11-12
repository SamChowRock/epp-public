# 第 63 章　账号管理命令

使用 Node 24.22.1 和 PostgreSQL 18。在第 60 章环境记录一个 active 且 Web 已开通的练习账号，保留密码、用户 ID 与当前会话。暂停写入，按[非空库备份与独立恢复](../chapter-22/backup-restore.md)恢复到新的 epp_ch53_verify。将本地 .env.database-verify 的 DATABASE_URL 和 .env.test 的 TEST_DATABASE_URL 分别指向新库。连接地址中的主机、端口、角色按实际配置。CLI 只读数据库配置。

```bash
nvm use
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch53_verify
npm run db:verify -- migrate status
npm run check
```

若从全新的空库开始，上述 deploy 改为 bootstrap，完成迁移后按[两个账号的准备步骤](../chapter-49/README.md)在本章库准备一个已开通练习账号。API 启动沿用[第 60 章命令](../chapter-51/README.md)，把预期库名换成本章库名。配套的[请求集合](../../requests/chapter-51.postman_collection.json)继续有效，05 登录、20 读回 userId。只做账号资格实验时不需要操作对象或运行寄信 Worker（新注册另需寄信）。在新的配套副本开发时将先前的本地 API 配置和存储应用身份配置到该副本，避免误用原库。

```bash
db=epp_ch53_verify
account='填入本轮20返回的userId'
suspend_id=$(node -p 'crypto.randomUUID()')
restore_id=$(node -p 'crypto.randomUUID()')
admin() {
  env -u DATABASE_URL -u DB_QUERY_DEBUG NODE_ENV=production node \
    --env-file=.env.database-verify dist/src/account-admin.js "$db" "$@"
}
admin preview "$account" off
```

先抄下库、账号和两个操作 ID，再逐行执行。每次成功输出一条 JSON。参数拒绝、收据不存在和同键异参返回 2，配置或运行失败返回 1。用 `echo $?` 紧接在该命令后读退出码。

```bash
admin apply "$account" off "$suspend_id"
admin receipt "$account" "$suspend_id"
admin apply "$account" on "$restore_id"
admin apply "$account" off "$suspend_id"
```

暂停后用原 Cookie 读 /profile/me 得到 403；恢复后重放旧命令仍能用同一 Cookie 读到 200。将两个 ID 填进[单笔观察查询](observe.sql)，在 DBeaver 对照 web_now 与 requested_enabled。命令仅设置 Web 资格，账号状态和会话寿命仍参与访问判定。业务状态已符合时，新操作仍得到自己的收据。退出或中断后，按保存的库、用户和 ID 查询，再决定是否用原参数重试。

改源码时先构建。需要看流程时，在 preview 命令的 node 后加入 `--inspect-brk=127.0.0.1:9231 --enable-source-maps`，从编辑器附加到 9231，在事务外的 context.get 处查看参数再继续。调试 apply 时暂停会消耗事务期限，结束调试后应按原 ID 查明结果。交付目录使用构建后的 dist、config、package.json 与锁，安装生产依赖，在运行环境注入 DATABASE_URL，执行 `NODE_ENV=production node dist/src/account-admin.js` 并追加同一组参数。此入口没有监听端口。

要跑完整回归，另建专用空测试库（例如 epp_ch53_regression）。按[第 58 章的独立回归步骤](../chapter-49/README.md)创建 .env.test-regression，将 DATABASE_URL 和 TEST_DATABASE_URL 都指向这个新库，联调用的 .env.test 继续指向 VERIFY。先用本章代码运行下方 bootstrap，在该库按[固定测试用户步骤](../chapter-42/README.md)插入样本，再运行后两行。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG
node --env-file=.env.test-regression scripts/deploy-verify.mjs bootstrap epp_ch53_regression
npm run build
NODE_ENV=test node --env-file=.env.test-regression --test --test-concurrency=1 test/*.test.mjs
```
