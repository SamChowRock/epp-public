printf '脚本收到 <%s>\n' "$EPP_CH01_LOG"
if [ -z "$EPP_CH01_LOG" ]; then
  printf '还没有选择日志\n' >&2
  exit 2
fi
cat "$EPP_CH01_LOG"
