#!/usr/bin/env bash
# 检查这次练习包的两个入口、两版正文与点文件。全程只读。
set -eu

if [ "$#" -ne 2 ]; then
  printf '%s\n' '用法：bash check-install.sh 白班包目录 A或B' >&2
  exit 2
fi
case "$2" in
  A) version=版本一 ;;
  B) version=版本二 ;;
  *) printf '%s\n' '期望版本请填 A 或 B' >&2; exit 2 ;;
esac

fail() {
  printf '复核失败：%s\n' "$1" >&2
  exit 1
}

CDPATH= cd -- "$1" || exit 1
for name in 版本一 版本二 导航; do
  [ -d "$name" ] && [ ! -L "$name" ] || fail "$name 应是包内目录"
done
for name in 版本一/说明.txt 版本二/说明.txt 版本二/.校对单; do
  [ -f "$name" ] && [ ! -L "$name" ] || fail "$name 应是包内普通文件"
done

[ "$(readlink 当前说明)" = "$version/说明.txt" ] || fail '当前说明的相对目标不符'
[ "$(readlink 导航/当班)" = "../$version" ] || fail '导航/当班的相对目标不符'
cmp -s 当前说明 "$version/说明.txt" || fail '当前说明未能读回所选版本'
cmp -s 导航/当班/说明.txt "$version/说明.txt" || fail '目录入口未能读回所选版本'
printf '%s\n' 'A1 先核对 /missing' 'A2 再核对 /archive' |
  cmp -s - 版本一/说明.txt || fail '版本一原文或换行不符'
printf '%s\n' 'B1 先核对 /today' 'B2 再核对 /later' |
  cmp -s - 版本二/说明.txt || fail '版本二原文或换行不符'
printf '%s\n' 'B 已校对 两行' |
  cmp -s - 版本二/.校对单 || fail '版本二校对单或换行不符'

printf '已从两个入口读回%s，两个版本的原文及校对单均相符。\n' "$version"
