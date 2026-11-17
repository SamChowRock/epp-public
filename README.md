# chapter-24-reader-b 完整源码参考

第24章兼容读取B：读2000、写1000；正式C为part-03/chapter-24（读写2000）。B与C使用完全相同的schema和迁移。先在本章同一实验库扩到2000，再让读取方到B，最后开放C长写入。不回滚迁移、不重写旧数据。B接受1000、拒绝1001；C写1001/2000后，停C回原B目录，B可读同ID长值200，但拒绝将长值重新提交。停B回C，2001拒绝。

本分支 `codex/reference/chapter-24-reader-b`，前置为 `part-03/chapter-24`。练习仅供所属章节对照，不传播到正式后续主线。保留个人成果，在独立的新目录取得本分支：

```bash
git clone --single-branch --branch codex/reference/chapter-24-reader-b https://github.com/SamChowRock/epp-public.git ../epp-chapter-24-reader-b
cd ../epp-chapter-24-reader-b
nvm use
npm ci
npm run check
```

上述步骤仅取得、安装与检查源码，尚未启动B。现在在B目录用编辑器准备私有 `.env`：保存C当前实际使用的同一实验库 `DATABASE_URL`，另设 `DB_QUERY_DEBUG=false`；逐项核对主机、端口、库名与角色，不使用VERIFY/SHADOW库，也不直接照抄示例地址。若保留 `.env.database`，同样核对它的目标。先停止C及其dev监听器，确认业务端口与Inspector9229已释放，再启动B。清除继承的进程变量，让dev加载本目录私有配置：

```bash
chmod 600 .env
unset DATABASE_URL DB_QUERY_DEBUG
npm run dev
```

.nvmrc固定Node24.22.1。业务端口默认3000，Inspector9229；可用PORT=3008覆盖业务端口，客户端同步改地址。使用自己保存的Postman请求或curl核对真实响应；静态检查不能代替HTTP验证。

npm run check自动生成Prisma客户端；应用启动不自动迁移。B参考不需要重跑或回退迁移。保留独立B/C运行目录，一次只启动一版，详见 [本章操作](database/chapter-21/README.md)。运行npm test时使用独立.env.test的TEST_DATABASE_URL，不能复用实验库。

停止参考进程后，返回自己保留的正式项目。正式路线继续 `part-03/chapter-24`；不要把参考练习合并到后续章节。
