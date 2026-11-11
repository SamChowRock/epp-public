# 第 55 章：调试性能与资源问题

本目录在第 54 章代码旁增加本机探针。API、Worker、数据库迁移和依赖锁不变。以下命令在配套仓库根目录执行。Node 24.22.1；依赖与编译用 `nvm use`、`npm ci`、`npm run build`。

## 单进程：忙、等和保留引用

```bash
umask 077
profiles=$(mktemp -d)
node examples/performance/runtime.mjs wait
node --cpu-prof --cpu-prof-dir="$profiles" --cpu-prof-name=cpu.cpuprofile examples/performance/runtime.mjs cpu
node --expose-gc examples/performance/runtime.mjs heap
for n in 1 4 8; do UV_THREADPOOL_SIZE=4 node examples/password-cost.mjs 19456 "$n"; done
```

CPU 文件在 `$profiles`；最后三个快照路径由 heap 命令输出，每次是新目录。只用没有业务数据的进程取样。DevTools 的 Performance 导入 CPU 文件，Memory 逐个导入三份快照，Summary 按类名过滤 PendingPreview。每次密码样本单开进程：既要看单项等待，也要看整批耗时与峰值 RSS。它测的是哈希，不包括登录或数据库。

## 同一个登录请求的两种等待

用 DBeaver 在本机 PG18 另建空库 **epp_ch55_lab**，由本次连接角色拥有；不接共享服务或日常账号库。依照[第 54 章](../../database/chapter-54/README.md)配置本地文件 `.env.perf`，仅需 DATABASE_URL，主机填回环，数据库名换为 epp_ch55_lab；连接串中密码的特殊字符按 URL 编码。新库只执行一次 bootstrap：

```bash
env -u DATABASE_URL node --env-file=.env.perf scripts/deploy-verify.mjs bootstrap epp_ch55_lab
umask 077
lablog=$(mktemp)
env -u DATABASE_URL node --env-file=.env.perf examples/performance/service.mjs epp_ch55_lab > "$lablog" 2>&1 &&
  rg '^LAB' "$lablog"
```

已经成功引导的同一练习库可以直接重跑后一条 Node 命令。从上章跟写只需取本目录。程序先用独立连接验证真实库名，再创建本次随机账号、登录并访问真实回环服务；关闭前只清理自己的账号、凭据和会话。每次启动独立 API 与两个名额的池，其他 API 的池读数与本程序无关。LAB 行中 requestId 可以回查同文件的 HTTP 日志；断言失败请看日志末尾及进程退出码，勿只统计 LAB 行。调试器暂停或整机忙时可能越过业务锁时限；关闭断点、保留失败样本，再在空闲时重跑。

[plan.sql](plan.sql) 在一个 SQL 编辑器内顺序执行，用临时表生成 4 万条记录，保存建索引前后实际计划，末尾回滚。若中途报错，在同一连接先 ROLLBACK。该实验不更改业务索引。[mail.sql](mail.sql) 只读当前库的邮件领取时刻与通道，不需要邮箱或令牌。要制造一笔到期任务，在同一专用库单开正常 API 和本机 Mailpit，暂不启动邮件 Worker；用集合 01 向新的虚构邮箱申请注册，在数据库按该收件人找本轮消息 ID，检查队列后用第 45 章的单笔命令发往本机 SMTP，再查一次。试完关闭本轮 API、Mailpit 和 SQL 连接，原始 profile、日志及快照留在本机临时目录。

## 55A：迟到的回填

运行 `node examples/performance/cache-race.mjs`，两次都让读请求先取得旧页，等写请求提交并删除缓存后，再恢复读请求的回填。比较普通键与版本键的下一次读取；无需数据库。
