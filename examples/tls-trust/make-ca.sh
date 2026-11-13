#!/bin/sh
set -eu
umask 077
if [ "$#" -ne 1 ]; then echo 'Usage: make-ca.sh NEW_CA_DIRECTORY' >&2; exit 2; fi
mkdir "$1"
cd "$1"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc -sha256 -days 90 \
  -subj '/CN=EPP Practice Root' -keyout root.key -out root.crt \
  -addext 'basicConstraints=critical,CA:TRUE,pathlen:1' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' -addext 'subjectKeyIdentifier=hash'
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc \
  -subj '/CN=EPP Practice Issuing CA' -keyout issuer.key -out issuer.csr
cat > issuer.ext <<'EXT'
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always
EXT
openssl x509 -req -in issuer.csr -CA root.crt -CAkey root.key \
  -set_serial "0x$(openssl rand -hex 16)" -sha256 -days 30 -extfile issuer.ext -out issuer.crt
openssl verify -CAfile root.crt issuer.crt
