if [ "$#" -ne 2 ]; then
  printf '用法：bash choose.sh 三位状态码 日志文件\n' >&2
  exit 2
fi
case "$1" in
  [0-9][0-9][0-9]) code="$1" ;;
  *) printf '状态码需要三位数字\n' >&2; exit 2 ;;
esac
grep "^$code " "$2"
