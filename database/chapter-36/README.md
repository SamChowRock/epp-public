# 第42章 从一封验证邮件建立账号

本章只开放注册请求和确认。新增Nodemailer 10.3.1（自带类型）、已验证邮箱、当前验证意图和凭据版本；旧用户、密码、会话与业务记录保留。邮箱是ASCII全小写产品政策，不删除点号或加号；不支持本地部分区分大小写的邮箱。手机号与真实供应商仅在正文讨论。

## 迁移与启动

先按第25章备份并独立恢复非空VERIFY，停该库写入并保存旧账号与具体业务记录。核对 `.env.database-verify`，清除旧shell的DATABASE_URL、SHADOW_DATABASE_URL、DB_QUERY_DEBUG覆盖，运行 `npm run db:verify -- migrate status`、`node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch36_verify`、`npm run db:verify -- migrate status`。追加迁移只建两表并给旧凭据补version=1，不重置密码，也不为旧用户捏造邮箱。旧ID登录继续可用。DBeaver先运行[安全投影](01-observe.sql)确认当前库与新表。

从当前分支初始化专用空库时，先运行 `npm ci`，设置 `.env.database-verify`，清除 shell 的 `DATABASE_URL` 和 `SHADOW_DATABASE_URL` 后运行 `node --env-file=.env.database-verify scripts/deploy-verify.mjs bootstrap epp_ch36_verify`，最后运行 `npm run db:verify -- migrate status`。命令末尾都换成建库或恢复时确定的库名。脚本在实际连接查询 current_database()，一致才部署。bootstrap 先复制第 40 章迁移原件建立基线，再部署当前完整目录；已有前章历史用 deploy。非空副本另做旧数据对照。

Node24.22.1下 `npm ci`、`npm run check`。Mailpit 1.33.0从[官方发行](https://github.com/axllent/mailpit/releases/tag/v1.33.0)下载对应macOS架构，解压后在工具目录前台运行：

```bash
./mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 \
  --disable-version-check --block-remote-css-and-fonts
```

两端口只绑本机，不配置relay。网页8025只接收本地邮件，不发到真实邮箱。默认临时存储，退出后不依赖邮件继续存在；若端口占用，另选端口并同步LOCAL_SMTP_PORT与浏览器地址。API只支持固定127.0.0.1的SMTP适配，不接受请求中传入的投递地址／凭据配置。

项目的 `.env.test` 只设置指向VERIFY的TEST_DATABASE_URL。从项目根目录启动开发入口：

```bash
unset DATABASE_URL TEST_DATABASE_URL APP_ORIGIN PORT LOCAL_SMTP_PORT DB_QUERY_DEBUG
verify_db='epp_ch36_verify'  # 换成本轮副本的库名
NODE_ENV=development node --env-file=.env.test --input-type=module -e '
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { withVerifiedDatabase } = await import("./scripts/verify-database.mjs");
await withVerifiedDatabase(process.argv[1]);
process.env.PORT = "3360";
process.env.APP_ORIGIN = "http://127.0.0.1:3360";
process.env.LOCAL_SMTP_PORT = "1025";
process.env.DB_QUERY_DEBUG = "false";
await import("./scripts/dev.mjs");
' "$verify_db"
```

沿用自动编译、重启及127.0.0.1 Inspector。新增入口与旧业务一起受来源、固定请求头、JSON／字节限制保护；这两个匿名动作不依赖Cookie／CSRF，但已有主动改密仍需要会话证明。每IP每分钟10次POST与登录共用，密码计算共用两名额，签发／投递另有两名额，同一用途／地址60秒冷却。

## 逐项操作

导入[Postman集合](../../requests/chapter-36.postman_collection.json)，逐条发送，不用Runner。秘密只放未同步的本地Environment，集合内默认留空；不要分享或导出填过的令牌／密码。练习密码满足原策略。已有reader36@example.test时先查归属，新建练习换另一虚构地址并同步SQL筛选。

1. 01请求注册202；Mailpit收到邮件；安全投影有未消费意图、没有已验证联系关系。把邮件令牌复制到registrationToken。
2. 02确认201，保存userId；03重放400。用户、邮箱、密码和消费状态一起提交，新用户默认webEnabled=false。
3. 04正确密码仍403；[开通SQL](02-grant-fixture.sql)替换为本轮返回UUID，只在VERIFY按BEGIN／UPDATE→检查一行→COMMIT操作，失败ROLLBACK。05邮箱登录200，不需要另造登录机制。
4. 停自己的Mailpit，用新虚构地址请求：仍202，日志delivery.failed／MAIL_DELIVERY_UNCONFIRMED，意图仍存在。恢复Mailpit后等该地址一分钟冷却再重发，从最新邮件继续。202不是送达证明，SMTP失败也不证明邮件没有被接收。
5. 在VS Code的request方法内观察issued.length和activeDeliveries，不展开密码或令牌；数据库提交后、发送前的断点可观察漏发窗口。关闭断点、换新地址重发后才比较正常delivery／HTTP耗时。
6. [两连接到期实验](03-expiry-lock.sql)只改新虚构地址的未消费意图，按正文逐块执行，最后两边都结束事务。生产API的1秒锁等待不因人工实验改长。
7. [保留期SQL](04-retention.sql)先预览、再按批清理过期24小时以上的意图，不删除账号或联系信息。单地址只一行不等于总存储有界；新增地址仍需维护与预算。

确认 `.env.test` 后 `npm test`，只作为有限回归入口。生产产物沿前章干净目录 `npm ci --omit=dev`，不加载开发.env，显式注入DATABASE_URL／APP_ORIGIN／CURSOR_HMAC_KEY／LOCAL_SMTP_PORT。核对登录、旧记录、文档默认404、无Inspector、正常SIGTERM；本章适配器仍只投本地收件服务。验证后才按备份／恢复流程单独升级DEV，不搬运虚构账号或开通SQL。

暂停时结束事务、撤销自己的会话、停止自己的API和Mailpit；恢复从数据库身份、迁移、账号状态与新邮件开始，不重建旧账号。邮件是短期证明，不能作为永久恢复材料。
