# 1C 无人值守的本地检查

在 VS Code 打开本目录，新建集成终端。以下练习使用本机 Bash、普通用户、一个新建的目录和两个同一用户可访问的本地文件夹。从这个终端先保存程序的绝对路径，再创建一次性样本。没有网络请求、账号或系统定时配置。

```bash
job="$PWD/deliver.sh"
lab=$(mktemp -d)
mkdir "$lab/source" "$lab/out"
printf 'release=blue\n' > "$lab/source/release.txt"
printf 'The bridge is open.\n' > "$lab/source/body.txt"
: > "$lab/source/ready"
env -i PATH=/usr/bin:/bin /bin/bash "$job" "$lab/source" "$lab/out" </dev/null
cat "$lab/out/report.txt"
```

应读到 `checked=blue` 和英文原句。最后一个可选实参为 `blue` 或 `amber`，优先于环境中的 `EPP_EDITION`；两处均未提供时才采用 blue。显式空值非法。发布方先准备完整且不再改动的输入，再建立普通文件 `ready`。练习只用当前用户控制的专用本地目录，不在一次运行里替换就绪后的文件。

要复验等待，在文件树里将 ready 改名为 ready.hold，执行下列命令。三次等待结束前不要创建新的 ready。

```bash
EPP_WAIT_STEPS=3 /bin/bash "$job" "$lab/source" "$lab/out"
printf 'status=%s\n' "$?"
cat "$lab/out/report.txt"
```

应为 75，蓝色旧报告保持。要复验同目标排斥，让第一份多等几轮；看到第一条 waiting，再在同一终端执行第二次和后续几行。如果第一份已经超时，重开一轮。

```bash
EPP_WAIT_STEPS=9 /bin/bash "$job" "$lab/source" "$lab/out" </dev/null &
first=$!
/bin/bash "$job" "$lab/source" "$lab/out" </dev/null
printf 'second=%s\n' "$?"
kill -TERM "$first"
wait "$first"
printf 'first=%s\n' "$?"
```

第二份输出含 delivery lock present，第一份结束为 143，输出目录里应没有 .delivery.lock。恢复 ready 文件，再跑第一段的交付命令。独立流程还可把 release.txt 的 blue 改为 amber：不带额外配置返回 65，加第三个参数 amber 后返回零。等待步数只控制等待 ready 的次数。权限实验使用自己控制的夹具；失败要核对这次退出状态和旧报告。

| 状态 | 结合诊断理解 |
| --- | --- |
| 0 | 已发布并完成正常清理。 |
| 64 | 参数、路径形式、版本选择或等待预算不符合约定。 |
| 65 | 发布方的标记和要求不一致。 |
| 66 | 输入缺失或标记读取失败。 |
| 73 / 74 | 输出或清理失败 / 暂停或正文传输失败。 |
| 75 | 未能取得已存在的交付锁，或就绪等待用完。 |
| 129 / 130 / 143 | 任务在检查停止请求的位置按捕获的 HUP / INT / TERM 结束；能否收到特定信号取决于启动方式。 |

若上一次遭到强制停止，可能遗留 .delivery.lock。先停止本练习的发起者并核对自己的活动作业和交付文件。在已经确认只有自己能用且没有任务运行的练习目录中，才把残留目录移到一个新名字留证。不得按时间或 owner 文件里的旧号码判定仍在运行的任务归属。回到 VS Code 双击 report.txt 核对内容；可在文件管理器通过上面 lab 变量的实际路径找到本次一次性数据。
