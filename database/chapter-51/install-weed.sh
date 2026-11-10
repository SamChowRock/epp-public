#!/bin/sh
set -eu
umask 077
case "$(uname -s)/$(uname -m)" in
  Darwin/arm64)
    asset=darwin_arm64.tar.gz
    digest=7aed4f7db8048a8aedab47a71ea4dd3875caa5abdb925d6aa72fb65438a47910 ;;
  Darwin/x86_64)
    asset=darwin_amd64.tar.gz
    digest=da72538d30dd25a9f26f52edd09c42136932ec88b7c9340da3f1ed3e6d11a2f1 ;;
  *) echo 'Use a native macOS arm64 or x86_64 terminal.' >&2; exit 1 ;;
esac
mkdir -p .chapter51-tools
cd .chapter51-tools
if [ -e weed ]; then echo 'Local weed already exists; check its version.' >&2; exit 1; fi
stage="$(mktemp -d ./install.XXXXXX)"
cd "$stage"
curl -fL --retry 2 --proto '=https' --proto-redir '=https' \
  -o "$asset" "https://github.com/seaweedfs/seaweedfs/releases/download/4.52/$asset"
printf '%s  %s\n' "$digest" "$asset" | shasum -a 256 -c -
tar xzf "$asset" weed
ln weed ../weed
../weed version
