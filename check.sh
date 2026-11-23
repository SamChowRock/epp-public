log="$1"
grep '^404 ' "$log"
result=$?
if [ "$result" -eq 1 ]; then
  printf '已经查完，没有 404\n'
  exit 0
fi
exit "$result"
