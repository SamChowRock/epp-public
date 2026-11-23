# 1B 从两个班次重建区域报表

用 VS Code 打开这个目录，在集成终端运行：

```bash
bash report.sh 区域.psv 早班.psv 晚班.psv
cat report.psv
cmp 预期报表.psv report.psv
```

两班的九行输入对应六个请求，预期文件保留四个区域，包含零请求的备用区。交换班次次序并再送一次早班，输出应与预期文件逐字节相同：

```bash
bash report.sh 区域.psv 晚班.psv 早班.psv 早班.psv
cmp 预期报表.psv report.psv
```

current.awk 收敛同一请求的多次交付，by-region.awk 按登记区域汇总。要做坏输入和更正实验，另存一份样本再改，保留原有四份数据作比较。report.psv 是成功生成的交付件。
