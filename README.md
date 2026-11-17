# chapter-14-configuration 完整源码参考

第14章阶段一，从第13章开始，增加集中配置parseConfig。按正文14.1断言校验配置；原GET /captures仍200。此阶段旧http-options与入口保持，尚不具备请求日志或关闭协调。

本分支 `codex/reference/chapter-14-configuration`，前置为 `part-02/chapter-13`。练习仅供所属章节对照，不传播到正式后续主线。保留个人成果，在独立的新目录取得本分支：

```bash
git clone --single-branch --branch codex/reference/chapter-14-configuration https://github.com/SamChowRock/epp-public.git ../epp-chapter-14-configuration
cd ../epp-chapter-14-configuration
nvm use
npm ci
npm run check
npm run dev
```

.nvmrc固定Node24.22.1。启动前停止另一份dev，业务端口默认3000，Inspector9229；可用PORT=3008覆盖业务端口，客户端同步改地址。使用自己保存的Postman请求或curl核对真实响应；静态检查不能代替HTTP验证。

生产核对执行npm run build，再PORT=3001 npm start；start只运行dist，不启用Inspector，不读取开发.env。内存数据不会跨进程保留。

停止参考进程后，返回自己保留的正式项目。正式路线继续 `part-02/chapter-14`；不要把参考练习合并到后续章节。
