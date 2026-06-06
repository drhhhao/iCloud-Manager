# iCloud 邮箱管理面板架构说明

## 背景

这个项目要做的是本地 iCloud 邮箱管理面板：批量导入邮箱，快速选择邮箱，并查看对应历史邮件。项目会持续迭代，所以不能把后端、导入、收信、缓存和前端交互都堆在一个文件里。

## 目标

1. 保持轻量，直接用 Python 标准库启动本地 Web 面板。
2. 保持清晰分层，后续接入真实 iCloud IMAP、更多导入格式或数据库时不会推倒重来。
3. 页面风格对齐问心版 X1 控制台的古典文牍美学风格。
4. 敏感信息默认不展示、不写死、不打印。

## 架构参考

只参考结构，不复制业务实现：

1. EmailEngine：`https://github.com/postalsys/emailengine`
   - 可借鉴点：把邮件连接能力做成独立服务，再由 API 层调用。
2. Modoboa Webmail：`https://github.com/modoboa/modoboa-webmail`
   - 可借鉴点：Webmail 相关能力按页面、账号、消息拆模块。
3. IMAPClient：`https://github.com/mjs/imapclient`
   - 可借鉴点：IMAP 连接和协议细节不混进页面逻辑。
4. imap_tools：`https://github.com/ikvk/imap_tools`
   - 可借鉴点：邮件搜索、拉取、解析应该形成独立工具层。

## 当前结构

```text
dashboard_app/
  config.py
  server.py
  http_server.py
  services/
    accounts.py
    importer.py
    mail_fetcher.py
    mail_parser.py
    cache.py
    sessions.py
  storage/
    json_store.py
  utils/
    text.py
  templates/
    index.html
  static/
    css/app.css
    js/app.js
    js/api.js
    js/accounts_view.js
    js/mail_view.js
    js/theme.js
    js/notifications.js
    js/dom.js
```

## 分层规则

1. `server.py` 只负责启动服务。
2. `http_server.py` 只负责 HTTP 路由、鉴权、请求参数和响应，不写复杂业务。
3. `services/importer.py` 只负责导入解析。
4. `services/mail_fetcher.py` 只负责按需拉取邮件。
5. `services/mail_parser.py` 只负责把外部响应整理成统一邮件结构。
6. `services/accounts.py` 只负责邮箱账号库。
7. `services/cache.py` 只负责邮件缓存文件。
8. `storage/json_store.py` 只负责底层 JSON 读写。
9. 前端 `templates/index.html` 只保留页面结构，样式放 CSS，交互按 JS 模块拆分。

## 当前范围

已做：

1. 批量导入 `邮箱----收信链接`。
2. 自动跳过非 iCloud 邮箱。
3. 本地保存账号库。
4. 选择邮箱后查看本地缓存。
5. 点击后按需拉取邮件并缓存。
6. 本地面板密码登录。
7. 问心版 X1 风格控制台 UI。

暂不做：

1. 不主动保存 Apple ID 密码、Cookie、令牌。
2. 不做批量自动登录 iCloud。
3. 不做删除远端邮件、标记已读、发送邮件等高风险操作。
4. 不直接依赖第三方付费服务。

## 后续实现思路

1. 如果后续要接入真实 iCloud IMAP，把 `services/mail_fetcher.py` 扩展成 provider 模式，例如 `providers/icloud_imap.py`。
2. 如果收信链接返回格式固定，把解析规则沉淀到 `services/mail_parser.py`，不要写在前端。
3. 如果账号数量变大，把 JSON 存储替换成 SQLite，但保持 `accounts.py` 对外方法不变。
4. 如果要加批量刷新，新增任务队列模块，不要让 HTTP 请求一直阻塞。

## 验收标准

1. `python -m compileall dashboard_app start_panel.py` 通过。
2. `python start_panel.py --import-file "邮箱列表.txt" --import-only` 能导入。
3. 面板能登录、加载账号、搜索邮箱、选择邮箱。
4. 静态资源能正常加载，不出现空白页。
5. 新功能不把业务逻辑塞回单个大文件。

## 待确认事项

1. 收信链接返回的真实邮件格式是否持续稳定。
2. 后续是否需要用 Apple 官方 IMAP app-specific password 方式接入。
3. 是否需要多用户登录，当前版本只做本机单用户面板。
4. 是否需要 SQLite，当前账号量用 JSON 足够。
