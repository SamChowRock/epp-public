printf '样本已经读到\n'
printf '正在等待 %s 秒\n' "$1" >&2
exec sleep "$1"
