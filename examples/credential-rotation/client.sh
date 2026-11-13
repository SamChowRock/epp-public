# Source in Bash from the operator's terminal. lab is a private directory.
# site is the restored HTTP origin. Keep the client URL constant and dial
# one specific loopback listener (or its SSH local forward) on each request.
hit() {
  local side=$1 path=$2 response=$3 port
  shift 3
  case "$side" in A) port=$port_a ;; B) port=$port_b ;; *) return 2 ;; esac
  curl -q --silent --show-error --max-time 10 --noproxy '*' \
    --connect-to "127.0.0.1:${site##*:}:127.0.0.1:$port" \
    --output "$lab/$response" --write-out '%{http_code}\n' \
    "$@" "$site$path"
}

# Save secrets in 0600 files inside lab. Do not print the response body.
save_proofs() {
  local side=$1 label=$2 result
  result=$(hit "$side" /auth/csrf csrf.json -b "$lab/cookies") || return 1
  [ "$result" = 200 ] || return 1
  node -e 'const fs=require("node:fs"), t=JSON.parse(fs.readFileSync(process.argv[1])).csrfToken;
    if (!/^[0-9a-f]{64}$/.test(t)) process.exit(1);
    process.stdout.write("X-CSRF-Token: "+t+"\n")' "$lab/csrf.json" > "$lab/$label.header" || return 1
  result=$(hit "$side" '/notifications?limit=1' page.json -b "$lab/cookies") || return 1
  [ "$result" = 200 ] || return 1
  node -e 'const fs=require("node:fs"), c=JSON.parse(fs.readFileSync(process.argv[1])).nextCursor;
    if (!c) {console.error("Need two visible notifications for this account"); process.exit(1)}
    process.stdout.write(c)' "$lab/page.json" > "$lab/$label.cursor"
}

write_capture() {
  hit "$1" /captures "$3" -b "$lab/cookies" -H "Origin: $site" \
    -H 'X-EPP-Request: 1' -H "@$lab/$2.header" -H 'Content-Type: application/json' \
    --data-binary "@$lab/capture.json"
}

next_page() {
  hit "$1" /notifications "$3" -b "$lab/cookies" --get \
    --data-urlencode limit=1 --data-urlencode "cursor@$lab/$2.cursor"
}
