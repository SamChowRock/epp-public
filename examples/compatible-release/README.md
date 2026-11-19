# 第 78 章发布副本

A 来自 `part-10/chapter-77`，B 来自本分支。在两份源码中分别使用 Node 24.22.1 和锁文件构建。部署到第 77 章恢复的独立副本，沿用对应 API 的私有配置；只在 B 的 API 环境中设置 `CAPTURE_INTENT_MODE=required`。省略时仍接受原来的可空写入。两版网页分别在各自的 `examples/handoff-client`，静态目录和 API 可独立交付。

- 从 B 的源码根用迁移身份运行 `node --env-file=/path/to/migration.env scripts/deploy-verify.mjs deploy 实际恢复库名`。确认 shell 没有覆盖该配置的 DATABASE_URL。迁移建立禁用的插入触发器。
- 在所有正常写入入口适配后，由表所有者连接已核对的发布副本，在 psql 设置 `\set expected_db 实际恢复库名`，再执行 `\i examples/compatible-release/activate.sql`。
- 在同一私有数据库会话准备下表，每行填入经该素材所有者确认的一条依据。正文给出观察、核对与分批提交的顺序。演练限用短中文说明；2000 字节是对本次导入的保守上限。

```sql
CREATE TEMP TABLE ch78_approved (
  user_id uuid NOT NULL, capture_id uuid PRIMARY KEY,
  expected_revision uuid NOT NULL,
  intent text NOT NULL CHECK (intent ~ '[^[:space:]]' AND octet_length(intent) <= 2000)
);
```

以表所有者在同一会话核对库名，设 `\set expected_db 实际恢复库名`，执行 `\i examples/compatible-release/backfill.sql`。返回行是新修订；复查零行原因。每批一次独立事务，最多 100 条。重连后须从保留的审核材料重建临时表。

回退只替换程序和与它配套的网页，保留现行凭据与发布数据库。先在触发器 D 时验旧版追加 NULL；触发器 O 时以同一条素材重试，读仍可成功，清空失败。回到 B 后旧请求应收到 400，合法写入仍可用。完成快照只用于该隔离发布练习。
