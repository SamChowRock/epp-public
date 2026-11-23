usage() {
  printf '用法：bash check-batch.sh 日志路径...\n或：bash check-batch.sh --list < 名单文件\n' >&2
  exit 2
}

run_one() {
  printf '检查 <%s>\n' "$1"
  bash check.sh "$1"
}

if [ "$#" -eq 0 ]; then
  usage
fi

if [ "$1" = "--list" ]; then
  if [ "$#" -ne 1 ]; then
    usage
  fi
  seen=0
  while IFS= read -r log || [ -n "$log" ]; do
    if [ -z "$log" ]; then
      continue
    fi
    run_one "$log" || exit "$?"
    seen=1
  done
  if [ "$seen" -eq 0 ]; then
    printf '名单里没有日志路径\n' >&2
    exit 2
  fi
else
  for log in "$@"; do
    run_one "$log" || exit "$?"
  done
fi
printf '本批检查完毕\n'
