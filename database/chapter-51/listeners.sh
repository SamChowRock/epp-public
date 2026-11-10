#!/bin/sh
set -eu
pid=${1:?Supply the SeaweedFS PID printed on startup}
case "$pid" in *[!0-9]*) exit 2;; esac
expected="$(for p in 18630 18631 18632 18633 18634 28630 28631 28632 28633 28634; do echo "127.0.0.1:$p"; done)"
i=0
while [ "$i" -lt 30 ]; do
  sockets="$(lsof -anP -p "$pid" -iTCP -sTCP:LISTEN -Fn | sed -n 's/^n//p' | sort)"
  if [ "$sockets" = "$expected" ]; then echo "$sockets"; exit 0; fi
  sleep 1
  i=$((i + 1))
done
echo "Unexpected TCP listeners for PID $pid:" >&2
echo "$sockets" >&2
exit 1
