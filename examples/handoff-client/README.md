# 把同源练习页交给使用者

部署者沿用[第 72 章 HTTPS 入口](../tls-trust/README.md)的 nginx、有效证书和原 API。先按书稿 72.3 让使用端能从练习网访问 api.epp.test 的 8443 和 9443。8443 转发 API，9443 转发私有对象请求。API 和使用端都要能解析该名称、信任同一练习根。API 的 AVATAR_S3_ENDPOINT 使用 https://api.epp.test:9443。对象端口保留路径、查询串和带端口的原 Host，清除代理给 S3 的 Cookie 并关闭含签名查询的访问日志。

操作端在本配套根目录执行。第 72 章的 nginx 以登录部署机的练习用户运行，其运行前缀为该用户的 ~/epp75-edge。只复制两个公开文件。

```bash
ssh epp-lab 'test -d "$HOME/epp75-edge" && mkdir -p "$HOME/epp75-edge/public/handoff"'
scp examples/handoff-client/index.html examples/handoff-client/client.js epp-lab:epp75-edge/public/handoff/
```

完成书稿 72.3 后，托管入口使用 nginx-private.conf，其中两条精确匹配已分别把 /handoff/ 和 /handoff/client.js 映射到上述文件。已经按 72.5 放过两份文件时直接从浏览器访问。更新同一位置的 HTML 或 JS 后刷新页面即可。若仍在使用 73 章开头的回环 nginx.conf，先走完 72.3 的私网部署及证书、对象和托管检查，再交给使用者。

部署者可在使用端浏览器的 Network 中检查 /handoff/ 返回 200、Content-Type 为 text/html；同目录 client.js 返回 200 并使用 JavaScript 类型。HTML 的 CSP 允许同源脚本、同源连接和 https://api.epp.test:9443 的图片。若页面按钮一直不可用，先看脚本的状态、类型，以及 Console 中的 CSP 错误，再核对 72.3 的两条精确路径和代理默认路径。

使用端浏览器打开 **https://api.epp.test:8443/handoff/**。以已有 Web 资格的练习账号登录，创建并按 ID 读回本轮素材，打开当前头像。另选一张不超过 2 MiB 的 PNG 或 JPEG，发布后核对新头像 ID 与解码宽高。订阅通知后，页面收到 inbox 事件会重新查最近 20 条；“刷新收件箱”也会显示 ID、类型及时间。展开“重置练习账号密码”，填写本账号邮箱并点“申请重置邮件”。在私有收件箱找到对应的新信，把令牌和新密码填回页面，点“确认重置密码”。在旧会话点“刷新收件箱”应见 401 AUTH_REQUIRED。使用同一用户 ID 和新密码重新登录并重新订阅，核对提示后查询和手动刷新显示同一个 password-reset 通知 ID。点“登出”结束当前会话。
