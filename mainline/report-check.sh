#!/bin/sh
if [ "$#" -ne 1 ]; then
    printf '用法：sh report-check.sh 日志路径\n' >&2
    exit 2
fi
if count=$(grep -c '^404 ' < "$1"); then
    printf '检查完成，匹配 %s 行\n' "$count"
else
    result=$?
    if [ "$result" -eq 1 ] && [ "$count" = 0 ]; then
        printf '检查完成，匹配 0 行\n'
    else
        printf '未取得完整计数：%s\n' "$1" >&2
        exit 2
    fi
fi
