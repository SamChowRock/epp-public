# 第十四章的三个运行阶段

三份补丁仅以 `part-02/chapter-13` 为起点，依次应用，每份只修改该阶段需要的文件；不是三个可任意挑选的功能开关。最终应用与 `part-02/chapter-14` 相同（不含文档及补丁资料自身）。正文按同样顺序讲解，不需要先看关闭实现才能验证配置。

需要直接运行参考时，保留原项目，另取资料目录。每条命令成功后才继续；目录已存在时保留并恢复已有进度，或为新一轮另选目录名。

```bash
git clone --single-branch --branch part-02/chapter-14 https://github.com/SamChowRock/epp-public.git ../epp-chapter-13-materials
cd ../epp-chapter-13-materials
stage_materials=$(pwd)
git fetch origin refs/heads/part-02/chapter-13:refs/remotes/origin/part-02/chapter-13
git worktree add -b practice/chapter-13-stages ../epp-chapter-13-stages origin/part-02/chapter-13
cd ../epp-chapter-13-stages
nvm use
npm ci
```

每个阶段先停止 dev。在这个干净起点按顺序执行以下一组，只有 `--check` 成功才应用；不直接套在已有个人修改或章节完成代码上。

```bash
git apply --check "$stage_materials/examples/chapter-13-stages/01-configuration.patch" &&
git apply "$stage_materials/examples/chapter-13-stages/01-configuration.patch"
npm run check
```

1. `01-configuration.patch`：正文 14.1 的直接解析断言应通过。`npm run dev` 后 GET /captures 仍为 200；保留旧 http-options 和入口。
2. 把上面两条 apply 的文件名都换成 `02-observation.patch` 后执行，运行 `npm run check`。以 `LOG_LEVEL=debug npm run dev` 启动，POST 正常原文为 201，非法类型为 400；响应 X-Request-Id 可关联入口、存储或错误、完成日志。仍由旧入口启动和停止，尚不验证排空。原 http-options 已删除。
3. 同样应用 `03-shutdown.patch`，执行 `npm run check` 和 `npm test`。dev 出现 app.ready；Ctrl+C 出现 app.draining、app.stopped。再按 14.4 运行生命周期实验，观察正常、请求中断、初始化失败与关闭超时。

补丁不包含个人 .env；已存在的配置只补字段，不覆盖。重新打开终端后，将 stage_materials 设为自己保留的资料目录绝对路径；用 `git status --short` 和源码核对已完成阶段，勿重复应用补丁。自己的跟写实现只对照补丁与结果，保留命名或组织上的合理差异。
