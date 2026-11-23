if [ "$#" -ne 1 ]; then
  printf '用法：bash publish.sh 日志文件\n' >&2
  exit 2
fi
draft=$(mktemp "./本次检查.XXXXXX") || exit 1
if bash check.sh "$1" > "$draft"; then
  mv "$draft" "./最近检查.txt" || exit 1
else
  result=$?
  printf '未发布，过程文件在 <%s>\n' "$draft" >&2
  exit "$result"
fi
