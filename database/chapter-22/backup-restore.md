# 本机小库的备份与独立恢复

前面导出的查询结果便于逐字段比较，但没有表定义、约束和迁移历史，不能拿它重建一个完整的库。这里使用 PostgreSQL 自带的 `pg_dump`，把当前一个数据库的结构和数据保存为归档文件；`pg_restore` 读取这个归档，向指定的空库恢复。归档包括 `_prisma_migrations`，不包含数据库外的角色、密码、服务配置或程序。我们在同一学习实例使用已经建立的 epp_owner；跨实例恢复还需要另行准备角色与权限。

先在仍为第二十一章结构的 VERIFY 完成一次恢复练习。按前文停止全部写入者、结束未提交事务；在 DBeaver 执行 `database/chapter-22/00-verify-samples.sql`，先单独核对连接查询，再执行事务，保存两条虚构样本的全部返回字段。固定 ID 已存在时先查询复用，不重复插入。若 VERIFY 已升级且没有旧备份，按本节末尾建立独立旧结构样本库，不清空现有库。

在终端检查客户端：

```bash
pg_dump --version
pg_restore --version
```

两者应为 18.x。找不到命令或版本不对时，回到[环境准备的 PostgreSQL 安装与 PATH](https://github.com/SamChowRock/EPP-Book/blob/main/environment-setup.md#homebrew-与数据库程序)，同一个 bin 目录也提供这两个工具。数据库服务器已经运行，不表示客户端工具在当前 PATH 中。

在 DBeaver 核对 VERIFY 的实际库名、端口和角色。本书默认库名是 `epp_migration_check`；若自己改过名字，替换下面源库名。不要把连接显示名称当作库名。

```bash
umask 077
backup_dir=$(mktemp -d "$HOME/epp-backup-XXXXXX")
pg_dump -h 127.0.0.1 -p 55432 -U epp_owner -W \
  -d epp_migration_check --format=custom --file="$backup_dir/before.dump"
```

`-W` 会在终端提示输入数据库密码，不把密码写进命令历史。`--format=custom` 保存 pg_restore 可读的归档。只在 pg_dump 成功退出、没有未处理告警后继续；失败生成的文件不能当作备份。`umask 077` 让新文件只供本机当前账号访问，目录放在代码仓库外；归档仍含完整原文，需要按原数据保护。记下准确路径和源库、章节、备份时间，重开终端后先恢复 backup_dir 的值，不重新猜文件。

在 DBeaver 切到第十八章使用的**管理连接**，目标为 postgres，开启自动提交，单独执行：

```sql
CREATE DATABASE epp_ch21_restore OWNER epp_owner;
```

这个库名必须尚不存在。已存在就先识别用途，为本次选一个新名字，不 DROP、不覆盖。创建后，按第十八章方式复制连接，数据库改为 epp_ch21_restore、角色仍为 epp_owner；在新连接执行身份查询并确认没有业务表。不要在它上面先运行迁移或 seed，恢复工具会建立归档中的对象。

```bash
pg_restore -h 127.0.0.1 -p 55432 -U epp_owner -W \
  -d epp_ch21_restore --single-transaction --exit-on-error \
  --no-owner --no-privileges "$backup_dir/before.dump"
```

`-d` 是恢复目标；这里没有 `--create`，不会按归档里的原库名另选目标。单事务让本次恢复整体成功或回滚，遇错立即停止；`--no-owner --no-privileges` 让对象由当前 epp_owner 建立，不搬运原库授权。这样适合本机同角色的小库练习，不等同还原生产访问控制。没有 `--clean`，因为我们不向已有业务库覆盖对象。

恢复成功后，分别在源 VERIFY 和新连接执行[04-backup-check.sql](04-backup-check.sql)。先看身份结果，再比较 users、captures 的完整行和 `_prisma_migrations` 的迁移名、校验值及完成状态；两条样本的 ID、空格、NULL／非空意图与 created_at 都应保持。约束结果应仍有主键、外键和 CHECK。恢复后约束表达式的括号排版可能变化，应核对判断条件与拒绝行为，不以显示字符串逐字相等为标准。只看到恢复命令退出 0，或只比较总行数，都不能证明关键内容完整。

确认恢复正确后，把第 22 章项目 `.env.database-verify` 的 DATABASE_URL **仅数据库名改为 epp_ch21_restore**，保留原主机、角色及个人密码；API 的 `.env` 先不改，也不启动旧服务向恢复库写入。后文先在这个恢复库部署第 22 章迁移，DBeaver 同样选它。这就把“恢复了旧结构”继续验证到“旧数据能升级”。原 VERIFY 保留作为对照。修改连接后按下一段的 unset 清除继承变量，避免命令仍连旧目标。

真正升级 DEV 前也按同样次序停止写入，以 DEV 为源重新备份，在另一个全新恢复库验证；VERIFY 的归档不能替代 DEV 的备份。pg_dump 取得的是一致快照，不会持续收集备份以后发生的写入；若升级后已经接收新记录，直接退回这份旧快照会丢掉那段新数据。此时维持停写并选择保留新数据的修复方案，不能把“能恢复归档”当成自动无损回退。长期备份、异机保存和按时间恢复在运维篇继续展开。

**已经升级、又没有第二十一章归档时**，这轮只能重新建立虚构的旧结构实验，不能重现自己的历史数据。用管理连接在自动提交下执行 `CREATE DATABASE epp_ch21_replay OWNER epp_owner;`，名称已存在则另选。另取第二十一章代码：

```bash
git clone --single-branch --branch part-03/chapter-21 \
  https://github.com/SamChowRock/epp-book-code.git ../epp-ch21-replay
cd ../epp-ch21-replay
nvm use
npm ci
```

在这个目录按第十八章方法由 `database/chapter-18/database.env.example` 新建 `.env.database`，填写自己的密码，DATABASE_URL 只指向 epp_ch21_replay。清除终端旧变量后执行 `npm run db -- migrate deploy`，在 DBeaver 的新连接核对迁移已到第二十一章，再执行上面的两条虚构样本脚本。现在用 epp_ch21_replay 作为 pg_dump 源库，按同样步骤恢复到另一个新库；回到第 22 章代码目录，把 `.env.database-verify` 指向恢复库再继续。切换代码或克隆完成不会改变原来的 DEV／VERIFY。


工具参数依据：[PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)、[pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html)。
