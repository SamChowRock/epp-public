#!/bin/sh
scratch=$(mktemp -d) || exit 1
trap 'rmdir "$scratch"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '临时目录 %s\n' "$scratch"
printf '按回车交付；也可以按 Ctrl+C 中断。\n'
IFS= read -r answer || exit 1
printf '交付完成\n'
