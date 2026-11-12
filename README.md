# 完成第一次 HTTP 往返

在项目根目录执行 `nvm use`、`npm ci`、`npm run check`，然后用 `npm run dev` 启动。新开 iTerm2 标签页执行 `curl -i http://127.0.0.1:3000/captures` 查看空列表。访问其他路径得到 404；按 Ctrl-C 停止服务后再访问原列表，观察连接失败。
