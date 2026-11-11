#!/bin/sh
# Run from the project root with DATABASE_URL pointing at a new, empty lab database.
set -eu
if [ "$#" -ne 1 ]; then
  echo "Usage: sh scripts/check-delivery.sh EXPECTED_EMPTY_DATABASE" >&2
  exit 2
fi
: "${DATABASE_URL:?Set DATABASE_URL for the new database}"
release=$(mktemp -d "${TMPDIR:-/tmp}/epp-release.XXXXXXXX")
trap 'rm -rf "$release"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
npm run build
cp -R dist package.json package-lock.json .npmrc "$release/"
(cd "$release" && npm ci --omit=dev --no-audit)
node scripts/deploy-verify.mjs bootstrap "$1"
node scripts/check-runtime.mjs "$release" "$1"
