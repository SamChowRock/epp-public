# 素材列表分页迁移练习页

这是第 34 章的本机开发消费者，用同一筛选比较旧全量 `GET /captures` 和新 `GET /captures/page` 的有序 ID。无第三方依赖、远程资源或浏览器持久化。先启动本章 API，再从配套仓库根执行：

```bash
node examples/paging-upgrade/server.mjs
```

打开 `http://127.0.0.1:3034` 。默认固定转发至 `127.0.0.1:3000`；另设 `TARGET_PORT` 可改变目标端口，`PORT` 改变页面端口。只绑定回环，不能指定任意目标 URL。默认只转发两个素材读取入口，不允许创建、修订或其他写入。

1. 输入本轮种子标记作为 q；保持大小写和空白一致。
2. 点击“读取旧全量列表”，查看条数和有序 ID。
3. 点击“读取第一页”，逐次点击“读取下一页”。每页展示本页接受的条数和 ID；可展开累计 ID。末页明确显示 `nextCursor = null`。
4. 两套读取都完成后，页面自动逐项比较有序 ID。仅条数相同不足以通过。

网络失败或 503 不接受半页，不推进请求游标。400 会清空两套结果并要求从第一页重新开始；401 / 403 清空身份和旧结果。再次点击“重试同一页”仍使用原游标。改变 q、重新开始、换用户或退出会清空两套结果；旧请求迟到不再累加。真实会话读取带原 `X-Expected-Session`，响应到达后再次查询身份，确认仍属于原用户与会话后才接受。后台隐藏结果，返回后重新确认身份。重试读取实时数据，不提供数据库快照；期间改变匹配范围可能漏看或新增结果。

默认 `/practice/identity` 只声明第 34 章 API 本身使用的固定用户 `10000000-0000-4000-8000-000000000001`，帮助页面管理当前结果；它不伪造登录或覆盖后端身份。此阶段不需要后续章节的认证路由。

## 两个独立且默认关闭的隔离模拟

```bash
FAULT_NEXT_PAGE_ONCE=true LEGACY_CAP=100 node examples/paging-upgrade/server.mjs
```

`LEGACY_CAP=100` 只在此代理把旧列表成功响应截为前 100 条；正式 API 未改动。`FAULT_NEXT_PAGE_ONCE=true` 在本次代理启动后第一次带 cursor 的成功页读取完整结束时，改回 503；不执行业务写入。两者可以分别开启。页面顶部始终标注开关状态。若需再次观察一次故障，重新启动代理。故障期间保留已接受页面，重试同一页后继续。不要把模拟当作正式服务行为或部署。

## 后续真实会话模式

第 38 章及后续已具备真实会话 API 时：

```bash
SESSION_MODE=true node examples/paging-upgrade/server.mjs
```

第 40 章及后续启用 CSRF 时：

```bash
SESSION_MODE=true CSRF_MODE=true node examples/paging-upgrade/server.mjs
```

本页提供真实 UUID / 密码登录和退出；只在会话模式转发 `/auth/me`、`/auth/csrf`、`/auth/login`、`/auth/logout`。密码提交后立即清空。浏览器处理 HttpOnly Cookie，页面不保存 Cookie、密码或 CSRF。登录带 `X-EPP-Request: 1`；退出取得 CSRF 后带 `X-CSRF-Token` 和 `X-Expected-Session`。Origin 原样转发，API 的 `APP_ORIGIN` 必须按环境说明准确包含页面来源（例如 `http://127.0.0.1:3034`），不能靠代理改写 Origin 绕过检查。会话模式不提供固定身份声明。

## 验证

```bash
node --test test/paging-upgrade-browser.test.mjs
```

测试包含纯分页状态与真实回环 HTTP 代理。无数据库依赖；上游为测试内的独立合成服务器。代理测试不等于正式 API 集成或浏览器交互验收。
