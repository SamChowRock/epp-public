#!/bin/sh
set -eu
store="$(pwd -P)/.chapter51-store"
weed="$(pwd -P)/.chapter51-tools/weed"
test -x "$weed" && test -s "$store/s3.json" && test -s "$store/config/filer.toml" && test -d "$store/data" || exit 1
for port in 18630 18631 18632 18633 18634 28630 28631 28632 28633 28634; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null; then
    echo "Port $port already in use" >&2
    exit 1
  fi
done
umask 077
cd "$store"
echo "SeaweedFS PID $$; private log: $store/weed.log"
exec env -i PATH="$PATH" "$weed" -config_dir="$store/config" mini -dir="$store/data" -admin.dataDir="$store/data/admin" \
  -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3.config="$store/s3.json" \
  -master.port=18630 -volume.port=18631 -filer.port=18632 -s3.port=18633 -admin.port=18634 \
  -master.port.grpc=28630 -volume.port.grpc=28631 -filer.port.grpc=28632 \
  -s3.port.grpc=28633 -admin.port.grpc=28634 -s3.autoCreateBucket=false -s3.iam=false \
  -webdav=false -s3.port.iceberg=0 -s3.port.lance=0 -debug.port=0 -admin.port.legacy=0 \
  -admin.ui=false -master.telemetry=false >>"$store/weed.log" 2>&1
