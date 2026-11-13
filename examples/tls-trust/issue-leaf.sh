#!/bin/sh
set -eu
umask 077
if [ "$#" -ne 3 ]; then echo 'Usage: issue-leaf.sh CA_DIRECTORY CSR NEW_OUTPUT_DIRECTORY' >&2; exit 2; fi
ca=$1
csr=$2
out=$3
mkdir "$out"
cat > "$out/leaf.ext" <<'EXT'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=DNS:api.epp.test
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always
EXT
openssl x509 -req -in "$csr" -CA "$ca/issuer.crt" -CAkey "$ca/issuer.key" \
  -set_serial "0x$(openssl rand -hex 16)" -sha256 -days 7 -extfile "$out/leaf.ext" -out "$out/leaf.crt"
openssl verify -purpose sslserver -verify_hostname api.epp.test \
  -CAfile "$ca/root.crt" -untrusted "$ca/issuer.crt" "$out/leaf.crt"
cat "$out/leaf.crt" "$ca/issuer.crt" > "$out/fullchain.pem"
