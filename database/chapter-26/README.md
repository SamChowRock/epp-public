# 第二十六章 幂等与审计

从 `part-04/chapter-25` 继续到 `part-04/chapter-26`。沿用Node 24.22.1、Prisma 7.10.1、PostgreSQL 18、本机DEV／VERIFY／SHADOW与固定开发用户；本章只给采纳接口增加操作身份，不改变原文创建、候选创建、追加修订或放弃的重试语义。

## 升级与旧数据

停止全部旧写入口，记录已有候选、学习记录及其关联。新增command_receipts保存成功操作的用户、操作UUID、版本化动作、候选ID、SHA-256请求指纹、201状态、公开响应快照和记录时间。主键为(user_id,operation_id)。本章没有回填：旧采纳保留，不能从候选ID推测客户端操作身份。首次部署后回执表为空是正常结果。

```bash
nvm use
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL
npm run db:verify -- migrate deploy
npm run db:verify -- migrate status
npm run db:verify -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run db -- migrate deploy
npm run db -- migrate status
npm run db -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run check
npm run dev
```

从前章自行编码时按第18章create-only步骤生成迁移，审查后再首次应用；成品分支直接使用 `20261104120000_command_receipts`。迁移包含事务和锁／语句超时，不改旧迁移。失败先检查真实结构和_prisma_migrations，确认整笔回滚并修复首因，才resolve --rolled-back这个迁移并重新deploy，不能用reset清空旧数据。启动检查读取新列并核对指定复合主键；缺失时不就绪。

采纳Body从 `{}` 改为 `{"operationId":"小写UUID"}`；旧请求返回400。接口响应结构仍为Acceptance，首次与重放都201，字段值相同，JSON键顺序及HTTP requestId等传输信息不承诺相同。恢复第25章程序虽然仍能操作原表，却会绕开回执，不是保留幂等承诺的安全回退；应保留新契约修复版本或停写排错。

## Postman与数据库对照

导入 `requests/chapter-26.postman_collection.json` 到专用本地工作区，baseUrl默认3000。按01～04准备一个新样本；03成功后生成并保存operationId与otherOperationId，并清掉上一组结果ID；05不会重新生成身份。不要在未确认的操作上重新运行01～03。05采纳201，06重放201，比较learningRecord.id、expression.id及acceptedAt；07换身份409，08创建第二候选，09沿用首个身份改候选得到OPERATION_CONFLICT，第二候选仍pending。10～12分别检查缺失字段、额外字段、查询参数400；13读取，14用新身份采纳第二候选201，15放弃已采纳候选409。脚本只存变量，不自动发送请求。

DBeaver执行01-inspect.sql逐条查询，替换全零UUID为此次集合变量。成功及任意次重放后，首候选学习记录1、回执1；第二候选在09冲突后仍为0／0。不要只看HTTP状态，不要在截图或普通日志中展开真实response全文。

## 响应丢失与锁等待

保留普通流程的第一候选，在执行完07～13、第二候选仍pending时暂不发送14。在第二终端启动 `node examples/lost-acceptance-response.mjs`，默认3010转发到本机3000；API使用其他端口时用TARGET_PORT和PORT显式指定。把14的URL暂改为 `http://127.0.0.1:3010/candidates/{{otherCandidateId}}/accept`，Body保持otherOperationId，发送14。代理仅在收到并消费第一份上游201后断开客户端，Postman应看到网络错误。此时数据库应已有accepted、学习记录1和回执1；保留Body和otherCandidateId，再发14应得到原201。恢复14的URL为 `{{baseUrl}}/candidates/{{otherCandidateId}}/accept`，Ctrl+C关闭代理。代理重启会重新丢弃第一份成功响应；它是独立实验，不进入业务应用或生产dist。

操作锁实验用02-operation-lock.sql：A连接在同一练习库锁住应用格式的用户／operationId组合，再发对应Postman请求，约一秒后503。A单独ROLLBACK，再发相同请求。不要把返回503解释为永久失败，不要更换身份，也不要把人为断点暂停时间计入等待基准。

用03-receipt-rollback.sql只在独立练习库为一个虚构pending候选的operationId注入末步CHECK失败。Postman500后查pending／0／0；移除这一个实验约束，保留操作身份重发201。NOT VALID只免查旧行，仍检查新写入。中断时先查pg_constraint是否残留该实验约束，不盲目重建或重复采纳。

## 调试、运行和检查

npm run dev沿用9229与源码保存后自动编译重启。VS Code先在CandidatesService.accept的结果判断行暂停，此处store的事务Promise已结束，适合查看返回对象；再用同一操作在PrismaCandidateStore.accept的previous分支观察命中回执。事务内断点停留超过5秒可能使本次请求失败，及时继续，随后用同一身份确认结果；此前已经提交的回执不会随这次读取事务回滚。

`npm test`只对独立测试库运行；会添加只针对当次虚构fixture的CHECK，验证末步回滚、同身份并发重放、不同身份竞争、请求冲突、旧记录及归属。使用单独的DATABASE_URL，不能把日常库当测试库。

交付仍为dist、package.json、package-lock.json和.npmrc；独立目录执行npm ci --omit=dev，运行环境提供DATABASE_URL，再npm start。docs默认404，无Inspector或watch。保留一次成功操作的candidateId与operationId，重启后重放并比较原结果；不能为了验证重启另建操作。主线只保证当前用户范围、单数据库内的采纳业务与回执原子性；不提供回执清理、后台重试队列或外部发送的原子性。
