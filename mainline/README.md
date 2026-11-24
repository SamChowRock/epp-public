# Unix Shell 主线练习

用 VS Code 打开自己新建的空练习目录，按第 1.1 节创建 `logs` 和 `out`。从头跟写可直接在该目录保存自己的脚本。想与完成稿核对时，把本页列出的脚本复制到下列位置，再在练习根目录运行。

| 位置 | 运行与核对 |
| --- | --- |
| [report.sh](report.sh) 放在根目录 | `sh report.sh -n 2 'logs/day one.log' logs/day-two.log` 按原顺序列出两份文件的前两行。 |
| [signal-demo.sh](signal-demo.sh) 放在 `out` | `sh out/signal-demo.sh` 先按回车交付，重启后按 Ctrl+C，对照临时目录和退出状态。 |
| [report-check.sh](report-check.sh) 放在 `out` | 1.13 的修订稿。运行 `sh out/report-check.sh 'logs/day one.log'`，再换第二天和缺件，连续核对匹配数与退出状态。 |
| [asset-list.sh](asset-list.sh) 放在根目录 | 按 1.15 在 `assets` 建两份输入，运行 `sh asset-list.sh 'assets/home page.txt' assets/app.txt`。清单先 3 后 5；传入缺件时读回上次清单。 |
