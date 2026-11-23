#!/bin/bash
# Usage: /bin/bash deliver.sh SOURCE_DIR OUT_DIR [blue|amber]
PATH=/usr/bin:/bin
LC_ALL=C
export PATH LC_ALL
umask 077

fail() {
  printf '%s\n' "$2" >&2
  exit "$1"
}

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  fail 64 'usage: deliver.sh SOURCE_DIR OUT_DIR [blue|amber]'
fi
src=$1
out=$2
case "$src" in /*) ;; *) fail 64 'source path must be absolute' ;; esac
case "$out" in /*) ;; *) fail 64 'output path must be absolute' ;; esac
if [ "$#" -eq 3 ]; then
  edition=$3
elif [ "${EPP_EDITION+x}" = x ]; then
  edition=$EPP_EDITION
else
  edition=blue
fi
case "$edition" in blue|amber) ;; *) fail 64 'edition must be blue or amber' ;; esac
budget=${EPP_WAIT_STEPS-3}
case "$budget" in 0|1|2|3|4|5|6|7|8|9) ;; *) fail 64 'wait steps must be a single digit 0..9' ;; esac
[ -d "$src" ] || fail 66 'source directory unavailable'
[ -d "$out" ] || fail 73 'output directory unavailable'

lock="$out/.delivery.lock"
owned=0
stop=0
cleanup() {
  local result=$?
  trap '' HUP INT TERM
  if [ "$owned" -eq 1 ]; then
    if ! rm -f "$lock/expected" "$lock/report.next" "$lock/owner" || ! rmdir "$lock"; then
      printf 'cleanup failed; inspect delivery lock\n' >&2
      if [ "$result" -eq 0 ]; then result=73; fi
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'stop=129' HUP
trap 'stop=130' INT
trap 'stop=143' TERM
check_stop() {
  if [ "$stop" -ne 0 ]; then fail "$stop" 'stop requested'; fi
}
if ! mkdir "$lock"; then
  if [ -d "$lock" ]; then fail 75 'delivery lock present'; fi
  fail 73 'cannot create delivery lock'
fi
owned=1
check_stop
printf '%s\n' "$$" > "$lock/owner" || fail 73 'cannot write owner note'
while [ ! -f "$src/ready" ]; do
  check_stop
  [ "$budget" -gt 0 ] || fail 75 'ready marker timed out'
  printf 'waiting for ready: %s\n' "$budget" >&2
  sleep 1 || fail 74 'pause failed'
  budget=$((budget - 1))
done
check_stop

[ -f "$src/release.txt" ] && [ -f "$src/body.txt" ] || fail 66 'release or body missing'
printf 'release=%s\n' "$edition" > "$lock/expected" || fail 73 'cannot write expected marker'
cmp -s "$lock/expected" "$src/release.txt"
match=$?
case "$match" in
  0) ;;
  1) fail 65 'release marker differs' ;;
  *) fail 66 'release marker unreadable' ;;
esac
printf 'checked=%s\n' "$edition" > "$lock/report.next" || fail 73 'cannot stage header'
cat "$src/body.txt" >> "$lock/report.next" || fail 74 'cannot stage body'
check_stop
if [ -d "$out/report.txt" ]; then fail 73 'report path is a directory'; fi
mv -f "$lock/report.next" "$out/report.txt" || fail 73 'cannot publish report'
printf 'published %s\n' "$edition"
