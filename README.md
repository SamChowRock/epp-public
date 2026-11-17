# chapter-07-source-label 完整源码参考

第7章独立来源标签练习，从第6章完成代码开始。POST /captures的sourceLabel省略时保留旧响应；字符串trim后须为1～80单元；null、数字、空白、81单元均400且不写入。GET保持旧行为。数据仅在进程Map，重启清空。

本分支 `codex/reference/chapter-07-source-label`，前置为 `part-01/chapter-06`。练习仅供所属章节对照，不传播到正式后续主线。保留个人成果，在独立的新目录取得本分支：

```bash
git clone --single-branch --branch codex/reference/chapter-07-source-label https://github.com/SamChowRock/epp-public.git ../epp-chapter-07-source-label
cd ../epp-chapter-07-source-label
nvm use
npm ci
npm run check
npm run dev
```

.nvmrc固定Node24.22.1。启动前停止另一份dev，业务端口默认3000，Inspector9229；可用PORT=3008覆盖业务端口，客户端同步改地址。使用自己保存的Postman请求或curl核对真实响应；静态检查不能代替HTTP验证。

生产核对执行npm run build，再PORT=3001 npm start；start只运行dist，不启用Inspector，不读取开发.env。内存数据不会跨进程保留。

停止参考进程后，返回自己保留的正式项目。正式路线继续 `part-01/chapter-06`；不要把参考练习合并到后续章节。
