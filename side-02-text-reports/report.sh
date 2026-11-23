if [ "$#" -lt 2 ]; then
  printf '用法：bash report.sh 区域表 一份或多份日志\n' >&2
  exit 2
fi
if [ -d ./report.psv ]; then
  printf '报表目标是目录 <./report.psv>\n' >&2
  exit 2
fi
export LC_ALL=C
set -o pipefail
inputs=()
for path in "$@"; do
  if [ ! -f "$path" ] || [ ! -r "$path" ]; then
    printf '输入不是可读普通文件 <%s>\n' "$path" >&2
    exit 2
  fi
  case "$path" in
    /*) inputs+=("$path") ;;
    *) inputs+=("./$path") ;;
  esac
done
work=$(mktemp -d "./本批报表.XXXXXX") || exit 1
trap 'rmdir "$work" 2>/dev/null || :' EXIT
awk -f current.awk "${inputs[@]:1}" | sort > "$work/current.psv" || exit "$?"
awk -f by-region.awk "${inputs[0]}" "$work/current.psv" | sort > "$work/result.psv" || exit "$?"
rm "$work/current.psv" || exit "$?"
mv "$work/result.psv" ./report.psv || exit "$?"
