# iCloud 邮箱管理面板

本地 Web 控制台，用来批量导入 iCloud 邮箱、快速选择邮箱、查看历史邮件。

**纯本地运行，不依赖外部数据库，不保存 Apple ID 密码。**

## 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url> iCloud邮箱管理面板
cd iCloud邮箱管理面板

# 2. (推荐) 设置面板密码
#    PowerShell: $env:ICLOUD_PANEL_PASSWORD="你的密码"
#    Linux/macOS: export ICLOUD_PANEL_PASSWORD="你的密码"

# 3. 启动面板
python start_panel.py
```

浏览器会自动打开 `http://127.0.0.1:8799/`。

## 密码设置

| 方式 | 说明 |
|------|------|
| 环境变量 | `ICLOUD_PANEL_PASSWORD`— 启动前设置即可 |
| .env 文件 | 复制 `.env.example` 为 `.env`，填入密码 |
| 什么都不做 | 默认密码 `changeme`（启动时有醒目警告） |

详细环境变量见 [`.env.example`](.env.example)。

## 导入邮箱

### 面板导入

启动面板后，在左侧「批量导入」区域粘贴或上传 TXT 文件：

```
name@icloud.com----http://example.com/show/.../name@icloud.com
another@icloud.com----https://other.example/mail/another@icloud.com
```

一行一个账号，格式为 `邮箱----收信链接`。

- 非 `@icloud.com` 邮箱会被自动跳过
- 重复邮箱会跳过（除非收信链接有变化）

### 命令行导入（不启动面板）

```bash
python start_panel.py --import-file "邮箱列表.txt" --import-only
```

## 查看邮件

1. 左侧选择邮箱
2. 右侧会自动加载本地缓存的邮件
3. 点击「刷新邮件」从源站拉取最新邮件

邮件按需拉取并缓存到本地，后续查看不需要重新拉取。

## 扫描历史邮件

点击「扫描历史」会遍历所有未缓存的邮箱，逐个拉取邮件。扫描支持：

- **自动重试**：失败的账号 30 秒后自动重试，最多 3 轮
- **重试失败**：扫描结束后可点击「重试失败」只重试上一次失败的
- **取消扫描**：扫描期间可随时取消

## 数据位置

所有数据都存储在项目目录下的 `data/` 文件夹中：

| 文件 | 说明 |
|------|------|
| `data/accounts.json` | 邮箱账号库（导入的账号信息） |
| `data/mail_cache/*.json` | 邮件缓存（拉取过的邮件内容） |

**这些包含你的实际数据，Git 已通过 `.gitignore` 排除，不会被提交。**

## 项目结构

```
dashboard_app/
├── config.py              # 配置（路径、并发、超时等）
├── server.py              # 启动入口
├── http_server.py         # HTTP 路由与鉴权
├── services/
│   ├── accounts.py        # 邮箱账号库
│   ├── importer.py        # TXT 导入解析
│   ├── mail_fetcher.py    # 收信拉取（HTTP）
│   ├── mail_parser.py     # 邮件格式解析
│   ├── scan_jobs.py       # 批量扫描任务
│   ├── cache.py           # 本地邮件缓存
│   └── sessions.py        # 面板登录会话
├── storage/
│   └── json_store.py      # JSON 文件读写
├── utils/
│   └── text.py            # 文本处理工具
├── templates/
│   └── index.html         # 页面结构
└── static/
    ├── css/app.css         # 控制台样式
    └── js/*.js             # 前端交互模块
```

## 系统要求

- Python 3.10+
- 仅使用 Python 标准库，无需 `pip install`

## 安全说明

- **不保存 Apple ID 或密码** — 只有邮箱地址和收信链接
- **纯本地运行** — 面板绑定 `127.0.0.1`，只有本机能访问
- **会话管理** — 采用 HttpOnly Cookie + 本地会话文件
- **数据独占** — `data/` 目录权限设为 `0600`

## 后续可扩展方向

- 接入真实 iCloud IMAP（`mail_fetcher.py` 扩展为 provider 模式）
- 替换 JSON 为 SQLite（数据量大时）
- 支持多用户登录
- 更多导入格式（CSV、JSON 等）

## License

MIT
