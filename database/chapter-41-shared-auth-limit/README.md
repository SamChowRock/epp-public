# 第41章：共享密码入口额度

从 `part-05/chapter-40` 接续，切到 `part-05/chapter-41`。沿用 PostgreSQL、Node 和现有环境文件；无新软件或依赖。先停止旧40密码入口，备份并选择独立非空 VERIFY 库，在代码根目录运行：

```bash
nvm use
npm ci
npm run db:verify -- migrate deploy
npm run check
```

新迁移只建 `auth_rate_buckets`，初始空，不回填旧Map次数、不修改账号、凭据、会话或业务数据。`DATABASE_URL` 配给API，`.env.database-verify` 配给迁移；两份文件核对为同一个练习库。新库须UTF8，原测试仍要求固定开发用户和Web资格。

构建后在两个终端分别启动（两个终端都先进入代码根目录，环境中设置同一个DATABASE_URL和CURSOR_HMAC_KEY）：

```bash
NODE_ENV=production APP_ORIGIN=http://127.0.0.1:8341 PORT=3341 node dist/src/server.js
NODE_ENV=production APP_ORIGIN=http://127.0.0.1:8341 PORT=3342 node dist/src/server.js
```

运行[浏览器观察页](../../examples/shared-auth-limit/README.md)。同一来源的login与password共用10次/60秒；首次获准开始窗口；合规的非法Body、错误凭据、后续CSRF失败和本机AUTH_BUSY都消耗一格。不同端口或重启不会补额度；代理信任规则沿40，任意X-Forwarded-For不能改直接客户端来源。窗口满返回429/AUTH_RATE_LIMIT及上取整秒Retry-After，不续期、不再加used。普通已登录GET不计数。

在DBeaver选中同一个VERIFY连接运行[观察SQL](01-observe.sql)，核对DB时钟、used、到期时间与行数。并发末格：先9次，再同时A/B，恰一个进入密码验证（合成错误凭据401），另一个429；本机密码并发上限2仍保留。等待SQL所示到期后再发，不自动重试。

表键为固定规则 `password-auth/v1` 加Express按可信代理配置解析的来源（最多128字符）；不绑定进程、端口、用户或签名key。IP不是人，NAT后设备可能共享额度。每规则双int事务建议锁 `(4542544,41)`，READ COMMITTED下独立语句取锁，再取DB毫秒时钟；最多删100行到期桶、最多保留1000行。本规则所有写者都须遵守锁协议。1000行含尚未清到的到期桶，清理有界；满时新来源429/Retry-After60，已有来源继续自己的窗口。可在单独空库按[合成容量SQL](03-synthetic-capacity.sql)观察；事务最后ROLLBACK，不能与浏览器样本混用。

[撤权与恢复SQL](02-permission-failure.sql)须用owner连接：把epp41_api换成真实受限API角色，仅选中REVOKE运行；HTTP应503/AUTH_RATE_UNAVAILABLE且带请求ID、Connection:close，原会话GET仍200。最后无论实验是否成功都单独运行GRANT恢复。运行角色需要此表SELECT/INSERT/UPDATE/DELETE，不能用owner做撤权对照；API启动还检查表/关键列，故先启动再撤权。锁超时、连接失败、结果未知也拒绝密码工作，不回退Map；提交未知可能已经耗格，不应盲目立即重试。draining仍为SERVICE_DRAINING。日志仅固定operation和错误码，不记来源/秘密。

短事务提交后才开始密码计算；锁内不hash、不网络、不签会话。全规则串行是一种吞吐代价，并非DDoS防护。旧40和新41混跑无法保证总共十次；旧代码读添加表后的库不等于限流保证可回退。

完整验证必须使用单独已迁移测试库：`TEST_DATABASE_URL=... npm test`。test/auth-rate-test-state.mjs在顶层场景前后清本规则状态，场景内部多API之间保持状态；生产启动与请求无reset开关。
