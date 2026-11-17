# chapter-15-array-store 完整源码参考

第15章独立综合练习，从第14章完成代码开始。新输入1200单元、旧输出保留2000；ArrayCaptureStore与原MemoryCaptureStore均保留顺序、副本与失败语义。node examples/review-contract.mjs验证1200/1201、1500旧值读取、副本隔离、Service直接拒绝和先筛选后limit。

本分支 `codex/reference/chapter-15-array-store`，前置为 `part-02/chapter-14`。练习仅供所属章节对照，不传播到正式后续主线。保留个人成果，在独立的新目录取得本分支：

```bash
git clone --single-branch --branch codex/reference/chapter-15-array-store https://github.com/SamChowRock/epp-public.git ../epp-chapter-15-array-store
cd ../epp-chapter-15-array-store
nvm use
npm ci
npm run check
node examples/review-contract.mjs
npm run dev
```

.nvmrc固定Node24.22.1。启动前停止另一份dev，业务端口默认3000，Inspector9229；可用PORT=3008覆盖业务端口，客户端同步改地址。使用自己保存的Postman请求或curl核对真实响应；静态检查不能代替HTTP验证。

生产核对执行npm run build，再PORT=3001 npm start；start只运行dist，不启用Inspector，不读取开发.env。内存数据不会跨进程保留。

停止参考进程后，返回自己保留的正式项目。正式路线继续 `part-02/chapter-15`；不要把参考练习合并到后续章节。
