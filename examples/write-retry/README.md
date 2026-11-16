# 第30章：刷新后继续原来的提交

正式API的 `POST /captures` 与 `POST /captures/:id/revisions` 支持可选 `Idempotency-Key` 小写UUID。缺头仍为旧请求语义；带头的首次与重放都返回201，创建的Location和ID保持，追加保留原修订号。同用户、同动作、同键改变输入返回409。不要在每次发送前重新生成键。

先按第29章配置独立VERIFY库，在项目根运行 `nvm use`、`npm ci`、`npm run db:verify -- migrate deploy`、`npm run check`。保留旧业务与旧采纳回执；新增表初始为空。原API仍使用 `npm run dev`，Inspector与生产入口保持原约定。`npm test` 只使用 `.env.test` 的显式 `TEST_DATABASE_URL`，不能指向日常库。

## 浏览器练习入口

本目录页面不随生产dist发布。固定身份夹具只在development/test运行、只绑定回环，使用正式CaptureCommands处理带键创建/追加；只提供这些操作和本章所需的读取、身份观察。它不提供认证，也不能替代正式API的完整契约。LAB_USER_ID来自启动进程，业务请求不能改变它。读取不接受未说明查询参数。

在DBeaver的独立VERIFY副本加入两名合成用户（前章固定甲已存在则保留）：

```sql
INSERT INTO public.users(id) VALUES
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;
```

先完成构建，再在项目根两个终端启动。第一终端使用 `.env.database-verify` 中的VERIFY连接，显式清除继承环境同名值；别把连接串贴进截图或公开记录。

```bash
unset DATABASE_URL
NODE_ENV=development API_PORT=3000 \
LAB_USER_ID=10000000-0000-4000-8000-000000000001 \
node --env-file=.env.database-verify examples/write-retry/api-fixture.mjs
```

```bash
PORT=3030 TARGET_PORT=3000 DROP_SUCCESS_ONCE=true \
node examples/write-retry/server.mjs
```

在Chrome打开 `http://127.0.0.1:3030`。先填原文提交，首次成功响应会丢失；DBeaver运行 `database/chapter-30/inspect.sql`确认已提交，再刷新同一页签，点击“继续上次提交”，得到原ID。代理对每个键只丢第一次201，恢复过程中保持代理运行；重启代理会重置故障记录。默认不设 `DROP_SUCCESS_ONCE` 时正常转发。

追加操作填写原素材ID。再次提交也是新操作，会产生新键。旧操作尚待确认时不开始新操作；清除待办仅删除本地恢复依据，不会撤销已发送请求。

换身份对照：先让甲留下待确认操作，停止第一终端的fixture，以相同端口、相同库和乙的LAB_USER_ID重启，保留代理及浏览器页签。刷新后页面应清除旧待办，不显示甲的原文，不自动POST。查看Chrome Network及乙的列表，确认没有甲的旧重发。实验后停止两项服务。

## 真实会话章节

第38章以后使用正式API，不运行固定身份fixture。将正式API的APP_ORIGIN设为页面源，在已登录的同源页面使用 `SESSION_MODE=true`；身份取 `/auth/me`。第40章以后再加 `CSRF_MODE=true`，写入携带当前会话CSRF与显式请求头。代理保留Cookie、Origin和预期会话，不伪造身份；真实登录需沿身份篇从同源入口完成。

页面保存原owner、路径、键与规范化前的原Body；每次重试先确认身份，再原样发送。真实会话写入带 `X-Expected-Session`，服务端比较实际会话；Cookie在确认后被另一页签更换时拒绝。退出清理本地内容，迟到结果不能重新显示；退出请求失败明确提示尚未确认撤销。

`sessionStorage`不保存密码、Cookie或CSRF Token。它能跨本页签刷新，不是跨设备离线队列。源码中的PendingWrite状态机可单独测试，实际代理测试需要本机回环监听权限。
