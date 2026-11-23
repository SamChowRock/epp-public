if [ "$#" -ne 2 ]; then
  printf '用法：bash pack-demo.sh 输入目录 输出目录\n' >&2
  exit 2
fi
source_dir=$1
output_dir=$2
run_dir=$(mktemp -d "$output_dir/run.XXXXXX") || exit 1
archive="$run_dir/demo.tar.gz"
if COPYFILE_DISABLE=1 tar -czf "$archive" -C "$source_dir" index.html assets/base.css assets/notice.txt; then
  gzip -t "$archive" || exit 1
  printf '%s\n' "$archive"
else
  result=$?
  printf '这轮没有交付，检查目录 <%s>\n' "$run_dir" >&2
  exit "$result"
fi
