# 第三十二章：密码凭据与秘密

从 `part-04/chapter-31` 继续到 `part-05/chapter-32`。新增密码与随机令牌函数、一个凭据表和一次性本地密码入口；固定用户、旧业务接口与原归属不变。尚无登录、Cookie 或 Session；接口仍只适合本机实践。

1. `nvm use`，`npm ci`，`npm run check`，`node examples/secrets.mjs`。源码跟写者先 `npm install --save-exact argon2@0.45.1`，按正文依次加入密码与令牌文件。实验只输出布尔值和长度。
2. 分别运行 `node examples/password-cost.mjs 19456 1`、`node examples/password-cost.mjs 19456 8`、`node examples/password-cost.mjs 65536 8`、`UV_THREADPOOL_SIZE=8 node examples/password-cost.mjs 65536 8`。每次是新进程；比较总耗时、各任务含排队耗时与峰值 RSS。有限实验不是公开入口的限流实现。
3. 准备完成第三十一章且含旧虚构记录的独立 VERIFY。DBeaver 在该连接运行 [01-before.sql](01-before.sql)，私下保存 ID 与归属结果；Postman 按已保存学习记录 ID 保存旧详情。停止该库写入，检查 `.env.database-verify` 的目标，清除当前 shell 的 DATABASE_URL、SHADOW_DATABASE_URL、DB_QUERY_DEBUG 覆盖值，依次执行 `npm run db:verify -- migrate status`、`npm run db:verify -- migrate deploy`、`npm run db:verify -- migrate status`。
4. 从源码跟写时，保存本章密码凭据函数与管理脚本后，再次 `npm run check` 生成新文件的dist；已取得完整章节代码也执行check。DBeaver 刷新表和约束，运行 [02-credential.sql](02-credential.sql)。首次升级 has_password=false；已有凭据则从 verify 恢复，不删行重新开始。重跑 01 对照旧 ID 与归属。
5. 沿正文30.4从`.env.test`取VERIFY连接启动开发API，将DB_QUERY_DEBUG改为false，确认Postman baseUrl；初始化和CLI在另一个终端执行。使用下面的 zsh 隐藏输入初始化，成功后立即重跑02保存created_at与旧计数的基线，再将 init 换成 verify 输入同一密码，预期 PASSWORD_MATCH。换一个字符验证，应为 PASSWORD_NO_MATCH；再次 init 返回 PASSWORD_ALREADY_EXISTS，最初密码仍可验证。该入口只创建固定开发用户的第一份密码，不提供密码重置。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL DB_QUERY_DEBUG
set +x
if IFS= read -rs 'epp_password?为 VERIFY 输入一个新的长密码：'; then
  printf '\n'
  printf '%s' "$epp_password" |
    NODE_ENV=development node --env-file=.env.database-verify scripts/password.mjs init
  password_status=$?
  printf 'exit=%s\n' "$password_status"
fi
unset epp_password
```

输入须为良构 Unicode，原始值最多256个UTF-16单元，NFC后15～128个码点；不裁剪空格或追加换行。脚本最多读取1024字节，严格解码，禁止DB_QUERY_DEBUG；不接受argv或环境变量携带密码。不把示例密码、密码记录或完整异常输出到日志。verify失败exit=1；执行失败后先读事实，不假定插入已回滚。

6. VERIFY通过后停止本次VERIFY API，按前章备份与独立恢复步骤保护DEV，停写并确认目标；迁移命令改用 `npm run db -- ...`，密码命令改用 `.env.database`。DEV独立设置密码，保留原userId，不能复制VERIFY密码。API的`.env`与测试的`.env.test`分别检查，`npm test`只连接升级后的隔离VERIFY。
7. `npm run dev` 沿用原调试与重启入口。导入 [chapter-32.postman_collection.json](../../requests/chapter-32.postman_collection.json)，填写实际baseUrl、captureId、learningId，只读旧详情和星图。对照迁移前响应及SQL，不靠首页是否恰好出现旧记录判断保留。密码仍不参与HTTP处理。
8. 独立运行目录复制dist、package.json、package-lock.json、.npmrc，`npm ci --omit=dev`；先运行下方无数据库检查确认原生密码依赖，再由环境提供DATABASE_URL与持久CURSOR_HMAC_KEY，`npm start`。读取旧详情，核对生产文档关闭，再正常停止。不要跨平台复制node_modules；管理脚本无需复制到常驻服务目录。

```bash
node --input-type=module -e '
import { hashPassword, verifyPassword } from "./dist/src/password.js";
const value = "Fabricated deployment check";
const encoded = await hashPassword(value);
if (!await verifyPassword(encoded, value)) throw new Error("PASSWORD_CHECK_FAILED");
console.log("PASSWORD_RUNTIME_OK");'
```

暂停时保留迁移历史、凭据和旧业务数据，关闭本次进程与DBeaver连接。恢复先status、02和verify，不重复init。当前固定成本为Argon2id、19MiB、两轮、p=1；提高成本前必须先让读取端兼容明确的新旧参数，再改变写入，不能用新成本直接淘汰旧凭据。升级后新增表不影响第31章程序读写旧业务；回退应用不删除凭据表。
