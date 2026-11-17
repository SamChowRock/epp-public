# 第50章本机只读身份观察

这是可选辅助页面，用来并排观察真实HTTP响应。正式API、Postman和SQL仍是跟做入口。浏览器无需保存Cookie／Bearer；服务端从权限0600的绝对路径配置读取凭据，只连接启动时选定的127.0.0.1 API。页面不生成身份，不取得微信code，不返回会话ID或秘密，不把平台替身称为微信登录。

先完成[本章实践](../../database/chapter-50-login-outbox/README.md)，取得实际API、素材ID与Web Cookie。mini令牌只能来自真实平台或44章的独立本地替身练习。观察某一旧素材时须用该素材原主人的实际会话；另一用户用来验证404。缺少mini令牌可省略对应字段，按钮明确返回未配置，不补造身份。

在项目根之外的私有目录新建配置，**先用`umask 077`再写文件**。模板中的大写值换成手中实际值，文件必须0600；`webCookie`是完整`名称=值`，不是Cookie所有属性。不要提交或分享配置。apiBase必须是显式端口的HTTP 127.0.0.1 origin，无路径、查询或用户信息：

```json
{
  "apiBase": "http://127.0.0.1:3000",
  "captureId": "实际素材UUID",
  "webCookie": "epp_session=实际43字符Token",
  "miniAToken": "原主人实际43字符Token",
  "miniBToken": "另一用户实际43字符Token"
}
```

```bash
node examples/login-outbox/server.mjs /绝对路径/私有配置.json
```

用浏览器打开`http://127.0.0.1:8350`；端口须空闲。Web、甲mini、乙mini按钮分别真实请求/auth/me与指定/captures/:id，成功时再取最新修订；显示HTTP状态、userId、channel、固定素材ID、revision以及响应正文SHA256摘要。摘要相同表明这次收到的素材JSON相同。userId与channel只提供集成观察，channel来源为选中的已固定传输方式；正式会话列表和SQL用于核对存储渠道。记录与身份是分别请求的，期间撤销可能使两个状态不同，请再次手动读取。

“未配置登录”按钮每点击一次就向同一个API实际POST /auth/mini/login（无Cookie）；无微信配置时显示503/MINI_NOT_CONFIGURED。没有定时轮询，入站请求仍计入41章密码来源额度；遇429等真实状态按实际窗口等待。Web或mini资格变化、会话撤销后可再次点按钮。HTTP API不可达显示观察连接失败502；未配置凭据显示OBSERVATION_CREDENTIAL_NOT_CONFIGURED且status为空，不编造HTTP结果。

服务仅支持固定页面和四个固定观察路由，不接受任意URL、ID、路径、请求头或代理参数。拒绝非本机Host／跨源请求，fetch禁止重定向。配置在启动时固定；修改后重启服务。停止用Ctrl+C，确认8350关闭，然后删除本轮配置；退出观察服务不会撤销正式会话。
