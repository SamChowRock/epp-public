# 第十四章的三个运行阶段

每个阶段都有完整可运行源码。先保留自己的第十三章跟写项目；直接运行参考时，独立克隆下表的对应分支，目录名不得与已有目录冲突。

| 阶段 | 分支 | 验证 |
|---|---|---|
| 配置 | `codex/reference/chapter-14-configuration` | 14.1 parseConfig断言，原GET 200 |
| 请求观察 | `codex/reference/chapter-14-observation` | npm test；POST 201/400与X-Request-Id日志 |
| 关闭协调 | `part-02/chapter-14` | npm test及14.4生命周期实验 |

```bash
git clone --single-branch --branch codex/reference/chapter-14-configuration https://github.com/SamChowRock/epp-public.git ../epp14-configuration
cd ../epp14-configuration
nvm use
npm ci
npm run check
npm run dev
```

第二阶段将分支和目录分别换为 `codex/reference/chapter-14-observation`、`../epp14-observation`；第三阶段换为 `part-02/chapter-14`、`../epp14-shutdown`。先停止前一个进程，避免端口和Inspector冲突。配置阶段仍保留旧入口；观察阶段尚不具备排空协调；第三阶段有完整关闭能力。

参考不包含个人.env；配置按自己环境准备，不覆盖原项目。跟写者按正文逐段实现，用源码与结果对照。完成后返回自己保留的正式项目，后续主线继续 `part-02/chapter-14`，不合并参考练习功能。
