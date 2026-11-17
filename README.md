# chapter-14-observation 完整源码参考

第14章阶段二，以上一配置参考为父，接入结构化请求日志、存储观察与Provider。npm test后，用LOG_LEVEL=debug启动，POST合法原文201、非法类型400，X-Request-Id关联http.started、store.completed或错误与http.completed。此阶段尚无排空协调。阶段三直接使用part-02/chapter-14，具备完整关闭能力。

本分支 `codex/reference/chapter-14-observation`，前置为 `codex/reference/chapter-14-configuration`。练习仅供所属章节对照，不传播到正式后续主线。保留个人成果，在独立的新目录取得本分支：

```bash
git clone --single-branch --branch codex/reference/chapter-14-observation https://github.com/SamChowRock/epp-public.git ../epp-chapter-14-observation
cd ../epp-chapter-14-observation
nvm use
npm ci
npm run check
npm run dev
```

.nvmrc固定Node24.22.1。启动前停止另一份dev，业务端口默认3000，Inspector9229；可用PORT=3008覆盖业务端口，客户端同步改地址。使用自己保存的Postman请求或curl核对真实响应；静态检查不能代替HTTP验证。

生产核对执行npm run build，再PORT=3001 npm start；start只运行dist，不启用Inspector，不读取开发.env。内存数据不会跨进程保留。

停止参考进程后，返回自己保留的正式项目。正式路线继续 `part-02/chapter-14`；不要把参考练习合并到后续章节。
