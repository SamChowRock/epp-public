# 第二十一章：保留旧记录，放宽中文意图

前置为第15～20章全部主线。起点 `part-03/chapter-20`，完成代码 `part-03/chapter-21`。本章正式把意图上限从1000扩到2000 UTF-16单元，后续主线沿用。依赖、连接、运行模式及16 KiB正文上限沿用第二十章；不重建库、不修改已执行迁移、不批量改写旧意图。

## 先核对数据与约束

停止开发进程，DBeaver DEV核对库/实例/角色，执行 `01-inspect-evolution.sql`，导出旧行完整值。已填的意图也应保留。VERIFY连接指向原独立校验库，SHADOW只供迁移重放；三者不可混用。

`.env.database`、`.env.database-verify` 与运行 `.env` 沿用前章。先 `unset DATABASE_URL SHADOW_DATABASE_URL`，再 `nvm use`、`npm ci`。现成代码已带 `20261102061033_widen_chinese_intent`，直接执行：

```bash
npm run db -- migrate status
npm run db -- migrate deploy
npm run db:verify -- migrate deploy
npm run prisma:generate
npm run check
```

status仅提示本章待执行正常；未知/失败历史先调查。每个库再次运行status和对应入口的 `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`；再执行SQL核对CHECK包含2000且已验证。diff无法代替CHECK检查。旧行各字段应相同，迁移不包含UPDATE。

从前章自行实现时，Schema保持 `String? @db.Text`，先执行 `npm run db -- migrate dev --name widen_chinese_intent --create-only`；打开空迁移草稿，补入正文的事务/超时/DROP与ADD CHECK，再 `npm run db -- migrate dev`。完成代码不要再次生成草稿。遇到reset提示停止核对，不能清空旧记录继续。

## 复现过渡版本B

A指第二十章程序（读1000/写1000）；B指兼容读取（读2000/写1000）；C是本章完成代码（读2000/写2000）。**先扩大DB，再让全部读取方到B，最后放开C写入。** B也能在旧DB上运行，但C写长值必须等DB放宽。

在本章完成代码根目录，停dev后应用补丁。只修改输入Schema和Service上限，输出仍2000。检查失败时先比较当前代码，禁止强制覆盖。

```bash
git apply --check database/chapter-21/reader-only.patch
git apply database/chapter-21/reader-only.patch
npm run check
npm run dev
```

导入 `requests/chapter-21.postman_collection.json`，逐项手动发送。先新建本章记录，把响应ID复制到集合变量captureId。baseUrl默认3000。GET先核对短值；B接受1000，拒绝1001。各长度请求的Scripts → Pre-request只设置JSON字符串变量，Body使用该变量，不会额外发送请求。不要用整组自动运行代替分阶段观察。

停dev并撤回补丁，恢复C：

```bash
git apply -R --check database/chapter-21/reader-only.patch
git apply -R database/chapter-21/reader-only.patch
npm run check
npm run dev
```

C接受1001/2000，拒绝2001，1000个emoji等于2000单元可接受，1001个emoji拒绝；拒绝后GET与DBeaver值保持上次成功结果。POST与PATCH均核对；缺失PATCH字段仍400，null清空。再查原文、ID、归属、创建时间保持。`02-check-rejection.sql`只对本章实验记录执行，先替换ID；2001个普通汉字直接SQL触发23514，随后在同一编辑器ROLLBACK。

## 观察兼容读取与危险回退

C写入长值后，停C，再次应用补丁启动B。B的详情和列表都应200；同一长值重新提交给B仍400，这是阶段写入策略。B没有截短旧值。

要对照A，可提前保存第二十章运行产物；没有保存时，保留当前项目，在其根目录独立克隆旧章节。这个路径同样适用于从空目录跟写、普通克隆和单分支克隆，不要求原项目拥有Git仓库、章节分支或配套origin。源码目录 `../epp-ch20-reader` 和产物目录 `../epp-ch20-runtime` 必须尚不存在；已占用时换一组新名字并同步后续命令，不覆盖原目录。

```bash
git clone --single-branch --branch part-03/chapter-20 \
  https://github.com/SamChowRock/epp-book-code.git ../epp-ch20-reader
```

确认克隆成功后再执行下面的构建；失败先处理地址、分支名或连接问题，不进入已有同名目录构建未知版本。当前第二十一章的文件和改动仍保留在原项目。

```bash
cd ../epp-ch20-reader
nvm use
npm ci
npm run build
mkdir ../epp-ch20-runtime
cp -R dist package.json package-lock.json .npmrc ../epp-ch20-runtime/
cd ../epp-ch20-runtime
npm ci --omit=dev
```

旧工作目录只构建，不运行迁移。按本章 `old-runtime.env.example` 在产物目录创建私有 `.env.production`，填同一开发库URL，保留DB_QUERY_DEBUG/DOCS_ENABLED=false，不放开发.env、不提交秘密。然后在产物目录：

```bash
unset DATABASE_URL DB_QUERY_DEBUG DOCS_ENABLED
NODE_ENV=production PORT=3001 node --env-file=.env.production --enable-source-maps dist/src/server.js
```

复制Postman详情请求，URL直接改成 `http://127.0.0.1:3001/captures/{{captureId}}`，列表同理；不要改集合baseUrl。A启动成功仍不理解长数据：详情500，含长记录的列表500。只观察读取，不让A写回。Ctrl+C停止A，回到原第二十一章目录继续用B/C恢复读取，保留长值。

观察完停B，反向撤回补丁，check后运行C；本章最终源代码读写均2000。实验记录可保留，不能为恢复A而清空意图。若只做B/C对照，不需要旧产物；完整兼容实验包含A的失败观察。

## 恢复与交付

暂停前记下数据库CHECK版本、当前运行产物A/B/C、是否已有超过1000单元的数据；结束未提交SQL事务并停止实验进程。下次先查询实际值，再决定恢复B还是C。迁移记录同步、Prisma diff为零与HTTP可用是不同证据。

DDL等锁失败沿用第二十章：找首因、结束阻塞事务、核对CHECK仍为1000且无部分改动，再按真实迁移名标记失败尝试rolled-back并重新deploy。已成功迁移不改文件。出现长数据后，应用回退目标是B，不能默认A安全。B会暂时拒绝新长输入，要同步告知接口调用方当前写策略；不要重试相同的400。

已有 `npm test` 保留最小回归。交付用 `npm run build` 的独立产物和固定生产依赖；运行配置由环境提供，`npm start`不开放Inspector，默认docs关闭。迁移步骤持有固定CLI与历史，先于放开写入执行；应用启动不自动迁移。重启同一库后GET应保留长值。多实例发布要确认所有读取者已兼容，再启用长写入，不能只验证一台。测试连接在根目录 `.env.test` 用 `TEST_DATABASE_URL` 单独提供；缺失时在打开应用前退出，不回退到开发 `.env` 或继承的 `DATABASE_URL`。配置与运行方式见[项目测试说明](../../README.md)。
