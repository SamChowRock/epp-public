# 第 16 章：JSON 文件实验

从第十五章主线继续，保持 2000 单元输入上限及原 HTTP 契约。`src/labs/json-file/` 是独立 Nest 组装，沿用 Controller、Schema、日志和关闭行为，`store.ts` 只用于机制实验，没有并发协调。生产 `npm run build` 不编译 labs；原 `npm start` 仍使用 Map。

在项目根目录执行 `nvm use`、`npm ci`、`npm run check`。停前章 dev 后，以 `mktemp -d` 建立私有实验目录，把绝对路径保存在当前终端的 `lab_dir`。用 Node 的 writeFileSync、`flag: 'wx'` 显式创建内容为 `[]` 的 captures.json；数据不要放进 dist 或 .dev。

`JSON_FILE="$lab_dir/captures.json" npm run dev:json-file` 监听 3016，Inspector 9229；在 VS Code 沿用 attach 配置，保存 TS 后自动编译重启。Postman 导入原集合并另存，baseUrl 改为 `http://127.0.0.1:3016`。创建 A，保留完整响应与 ID，正常停止并重启，按原 ID 读详情核对三个字段。文件缺失、格式损坏、重复 ID 均在监听前拒绝，watcher 仍等待修改；Ctrl+C 停止整个开发入口。

CLI 先执行 `npx tsc -p tsconfig.dev.json`，不需要 API 运行。修改 store.ts 后重新编译。下列命令均从项目根运行：

```bash
node examples/json-file/lab.mjs init "$lab_dir/empty.json"
node examples/json-file/lab.mjs copy "$lab_dir/captures.json" "$lab_dir/base.json"
node examples/json-file/lab.mjs input "$lab_dir/B.json" 'B: saved by writer one'
node examples/json-file/lab.mjs input "$lab_dir/C.json" 'C: saved by writer two'
node examples/json-file/lab.mjs copy "$lab_dir/base.json" "$lab_dir/direct.json"
node examples/json-file/lab.mjs inspect "$lab_dir/direct.json"
```

init、copy、input 拒绝覆盖已有目标。先核对 base 只有 A；重复实验用新目标文件名。两个新终端都进入本项目、执行 nvm use 并各自恢复 lab_dir 绝对路径：

```bash
# 终端一
node examples/json-file/lab.mjs write "$lab_dir/direct.json" "$lab_dir/B.json" direct
# 终端二
node examples/json-file/lab.mjs write "$lab_dir/direct.json" "$lab_dir/C.json" direct
```

两边均 read-ready 后，先放行 B，等 saved 和退出码 0，再放行 C。inspect 最终只有 A、C。每次退出后立即 echo $?。用新副本和 replace 模式重复，结果仍丢 B。before-rename 模式先在 read-ready 回车，temp-ready 时 Ctrl+C，正式文件保留 A，同目录遗留临时文件有 A、B。不能把临时文件存在当作发布完成。

保留失败现场，再复制 base 到 recovered.json。依次以 serial 模式放入原 B.json、C.json，逐条等待退出 0，检查原 A、B、C 的三个字段均保留；再放 B 会拒绝。这依靠保存的原始输入，无法从 [A,C] 自行重建 B。这里没有断电、跨文件系统或网络文件系统保证。

离开前停止 API、watcher、所有等待输入的 CLI，断开调试器，保留基线和输入。下一章从第十五章主线继续，不携带文件仓储。
