#!/bin/sh
if [ "$#" -eq 0 ]; then
  printf '用法：sh asset-list.sh 文件…\n' >&2
  exit 2
fi
tmp=$(mktemp out/.assets.XXXXXX) || exit 1
trap 'rm -f "$tmp"' EXIT
trap 'exit 1' HUP INT TERM
for file do
  if [ ! -f "$file" ]; then
    printf '找不到普通文件 <%s>\n' "$file" >&2
    exit 1
  fi
  bytes=$(wc -c < "$file") || exit 1
  printf '%d\t%s\n' "$bytes" "$file" >> "$tmp" || exit 1
done
mv -f "$tmp" out/assets.tsv || exit 1
