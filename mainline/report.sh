#!/bin/sh
usage() {
  printf '用法：%s [-n 行数] [--] 文件…\n' "$0" >&2
}

limit=1
while getopts ':n:h' opt; do
  case "$opt" in
    n) limit=$OPTARG ;;
    h) usage; exit 0 ;;
    :) printf '选项 -%s 缺少值\n' "$OPTARG" >&2; exit 2 ;;
    \?) printf '未知选项 -%s\n' "$OPTARG" >&2; exit 2 ;;
  esac
done
shift "$((OPTIND - 1))"

case "$limit" in ''|*[!0-9]*) usage; exit 2 ;; esac
if [ "$#" -eq 0 ]; then usage; exit 2; fi
for file do
  if [ ! -f "$file" ]; then
    printf '缺少普通文件 <%s>\n' "$file" >&2
    exit 1
  fi
  printf '文件 <%s>\n' "$file"
  case "$file" in -*) file=./$file ;; esac
  case "$limit" in
    *[1-9]*) head -n "$limit" "$file" || exit 1 ;;
  esac
done
