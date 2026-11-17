# 第50章：把两条能力线接到同一服务

当前源码从第49章合并第44章，保留两个原tip的祖先关系。49提供邮件出站队列和独立单笔投递；44提供小程序身份、mini资格和会话渠道。AuthModule同时装配MiniController／MiniService／WechatLogin和使用队列的RecoveryService工厂；数据库启动探针覆盖两个模型。平台交换仍使用正式固定微信适配器，未加本地OpenID登录路由。

## 从已有非空库升级

保留原44或49源码与其release、实际私有配置、原Cookie及指定素材ID。按第20／24章备份和恢复到独立VERIFY，先用原源码读取旧数据。首次准备PostgreSQL、Node和DBeaver的步骤见书稿环境说明；本章沿用原工具。这里没有新迁移：从44来只缺49的verification_outbox迁移，从49来只缺44的mini_identity迁移。不能复制新schema代替迁移，也不要改动已执行迁移文件。

确认`.env.database-verify`指向副本后，在项目根执行，最后参数改成实际副本库名：

```bash
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy your_verify_database
npm run db:verify -- migrate status
npm run check
```

空库用相同脚本的`bootstrap`模式；直接对空库`migrate deploy`会因为历史命名排序在旧基线前执行新迁移而失败。已有失败迁移的库先保留并检查，不把它当成空库继续bootstrap。

用[指定对象核查](01-observe.sql)比对原用户、素材、修订、渠道、原意图和原消息；把每处全零UUID换成对应对象ID。旧迁移checksum和finished_at、旧业务逐值保持。新表首次为空，新列采用迁移中明定默认值；不推断小程序映射、不为旧用户开mini资格。确认后才升级日常开发库。

## 跟做与验收

先用本章[Postman集合](../../requests/chapter-50-login-outbox.postman_collection.json)在未同步的本地工作区填变量；每条请求禁用自动Cookie jar，Web使用显式webCookie，mini使用显式Bearer。不要导出含真实值的环境。正式API未配置微信时，mini/login为503/MINI_NOT_CONFIGURED；mini/link先验证原密码：错密码401，正确密码再到未配置平台503。该失败不创建映射或会话；所有密码入口仍共用41的来源额度。不要把测试code填进真实微信适配器期待登录成功。

需要合成mini会话时，另按[44章本地练习](../chapter-37/README.md)运行独立MiniService平台替身。它不改变正式平台适配器；新练习的用户／素材与旧非空历史是两种对照，不混称同一记录。观察原历史时只使用确实已经属于该用户的合成mini会话。页面本身不创建身份。

Web登录→CSRF→创建或读取指定旧素材；甲mini读取同一ID应200，乙mini应404。交叉Cookie/Bearer应401，同时发送两者400；mini访问CSRF为403。使用[资格事务](02-eligibility.sql)先只关闭mini：甲mini403、原Web200；恢复后甲mini200。使用Web的真实CSRF定向DELETE甲mini sessionId，甲mini401，原Web和乙mini仍200。会话列表给出的channel是数据库渠道证据。

注册／恢复请求只产生意图和出站指令，202不代表邮件送达。按[49章单笔投递说明](../chapter-42/README.md)运行原有投递入口，使用指定messageId。accepted表示SMTP接收，unknown保留人工核对；不要批量重发或重置旧消息。邮箱令牌只在本地邮箱客户端取得，不能通过SQL或观察页读取。登录、资格和会话撤销前后按同一messageId核对状态不变，别把新消息误当旧消息。

## 自动回归和退出

`.env.test`只填`TEST_DATABASE_URL`到独立已迁移VERIFY，然后`npm test`；不回退DEV。刚bootstrap的独立空测试库须先沿49说明插入原固定虚构用户：`INSERT INTO public.users(id, web_enabled) VALUES ('10000000-0000-4000-8000-000000000001', true) ON CONFLICT (id) DO NOTHING;`。仅测试库做这一步，不能向升级非空副本补造业务身份。本章新集成测试通过真实HTTP请求入队、确认未配置平台与密码顺序、同素材隔离、资格与定向撤销、原消息及意图逐值不变。平台交换用独立服务替身；不宣称连接微信或真实SMTP。

先停观察服务，再停API／单笔投递入口，确认监听关闭。44本地练习回车会撤销和删除其创建的合成对象；旧非空历史、队列证据和备份保留。删除本轮私有观察配置和未同步Postman环境。停进程不等于撤销会话，需要撤销时走正式DELETE／退出接口。旧代码回退不回滚数据库；保留备份作为恢复入口。
