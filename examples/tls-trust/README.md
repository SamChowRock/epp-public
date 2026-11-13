# 用练习 CA 接手 HTTPS 入口

沿用[第 73 章的部署](../portable-release/README.md)。沿用与目标平台匹配、摘要已验的完整运行归档和原有生产依赖。原 API 继续在 Debian 回环 3374 接收 HTTP。为了在 API 运行时单独更换入口证书，本例用 nginx 在 8443 接收 HTTPS，再把请求转给 API。部署端保管服务私钥，操作端负责签发并用 curl 验收。使用已核对指纹的 SSH 主机别名 `epp-lab`、OpenSSL 3、带 SSL 模块的 nginx、一个可登录的练习账号。选做浏览器对照时，用 Firefox 的一次性配置单独导入、撤销练习根。以下两端各保留一个 Bash 会话。先核对两端 UTC 时间，预留部署端与操作端各自的回环 8443。

## 建一个独立入口

操作端从本配套根开始。签发目录、下载的证书和稍后的客户端状态都放在新的私有目录内。

```bash
umask 077
src="$PWD/examples/tls-trust"
lab=$(mktemp -d)
sh "$src/make-ca.sh" "$lab/ca"
openssl x509 -in "$lab/ca/root.crt" -noout -fingerprint -sha256
ssh epp-lab 'umask 077; mkdir "$HOME/epp75-edge"' &&
  scp "$src/nginx.conf" epp-lab:epp75-edge/nginx.conf
```

部署端设置变量。API 继承上一章的生产配置和工作目录，按书稿使用独立配置文件将 APP_ORIGIN 设为 `https://api.epp.test:8443`；此例的 API 已在 IPv6 回环 3374 就绪。nginx 以当前练习用户运行。若二进制未进入 PATH，给 nginx_bin 填绝对路径。

```bash
edge="$HOME/epp75-edge"
cd "$edge"
nginx_bin=$(command -v nginx)
umask 077
new_key() (
  set -eu
  slot=$1
  mkdir "$slot"
  openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc \
    -subj /CN=api.epp.test -keyout "$slot/leaf.key" -out "$slot/leaf.csr"
  printf 'ssl_certificate %s/fullchain.pem;\nssl_certificate_key %s/leaf.key;\n' \
    "$slot" "$slot" > "$slot/tls.conf"
)
new_key slot-a
```

操作端定义下面的函数。调用前确认 CSR 来自自己要交付的部署目录。固定名称由签发脚本决定；脚本拒绝覆盖已有输出目录。

```bash
issue() (
  set -eu
  slot=$1
  scp "epp-lab:epp75-edge/$slot/leaf.csr" "$lab/$slot.csr"
  sh "$src/issue-leaf.sh" "$lab/ca" "$lab/$slot.csr" "$lab/$slot-issued"
  scp "$lab/$slot-issued/fullchain.pem" "epp-lab:epp75-edge/$slot/fullchain.pem"
)
issue slot-a
```

部署端启动练习入口。-p 指定独立运行前缀，-c 指向其内的主配置，PID、日志、临时文件也都在此前缀下。

```bash
ln -s slot-a/tls.conf active.conf
"$nginx_bin" -t -p "$edge/" -c nginx.conf && "$nginx_bin" -p "$edge/" -c nginx.conf
```

在操作端新开终端运行 `ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8443:127.0.0.1:8443 epp-lab` 并保持打开。回到原操作端会话：

```bash
site=https://api.epp.test:8443
client=(curl -q --noproxy '*' --max-time 12 -sS --resolve api.epp.test:8443:127.0.0.1 --cacert "$lab/ca/root.crt")
"${client[@]}" -w '\nHTTP %{http_code}\n' "$site/profile/me"
```

匿名读本人资料应得 401。正文 74.3 给出 Firefox 配置内的独立验证，以及保存 HTTPS Cookie、写入并读回一条素材的步骤。保持 API 和数据库运行。

## 预检、切换、回退

部署端 `new_key slot-b`，操作端 `issue slot-b`。保留 A。在部署端 Bash 定义以下函数；GNU mv 的 -T 将目标当作单个路径，临时链接与现行链接在同一目录。

```bash
activate() (
  set -eu
  slot=$1
  case "$slot" in slot-a|slot-b) ;; *) exit 2 ;; esac
  cd "$edge"
  sed "s@include active.conf;@include $slot/tls.conf;@" nginx.conf > candidate.conf
  "$nginx_bin" -t -p "$edge/" -c candidate.conf
  ln -s "$slot/tls.conf" active.next
  mv -Tf active.next active.conf
  "$nginx_bin" -s reload -p "$edge/" -c nginx.conf
)
activate slot-b
```

一次由一位操作者切换。若 active.next 已存在，先查上次操作停在哪里。新建连接比对线上序列号、SAN、有效期，在操作端带原 Cookie 读同一素材。回退用 `activate slot-a`，然后重新做这两项检查。连接探测可在操作端 Bash 执行：

```bash
(
  set -o pipefail
  openssl s_client -connect 127.0.0.1:8443 -servername api.epp.test \
    -verify_hostname api.epp.test -verify_return_error -CAfile "$lab/ca/root.crt" </dev/null |
    openssl x509 -noout -serial -dates -ext subjectAltName
)
```

完成交付时保留客户使用的 HTTPS 名称、端口、信任的根证书和已有会话。按正文把同一套入口和 API 交给宿主管理，记录证书到期时间、活动槽、私钥权限、上游、原收据及可读的素材 ID。重新建立 TLS 连接，核对名称和链，再带原 Cookie 经相同 HTTPS 地址读取原素材。使用 SSH 转发的练习环境在客户端使用期间须能到达入口。单独为排错开设的 Firefox 配置可按正文撤销练习根，正常客户端保留自己的信任。

只有另起副本诊断 HTTP 时，才为该副本单独设置回环 APP_ORIGIN、端口和新的练习会话。若要拆除独立的临时 nginx，在部署端执行 `"$nginx_bin" -s quit -p "$edge/" -c nginx.conf`，确认该监听释放后关闭其 SSH 转发。签发私钥、叶私钥、Cookie、写令牌及业务配置只保存在各自的私有目录。
