from __future__ import annotations

from dashboard_app.config import settings
from dashboard_app.http_server import create_server


def main(host: str = "127.0.0.1", port: int = 8799) -> int:
    server = create_server(host, port)
    print(f"[ok] iCloud 邮箱管理面板已启动: http://{host}:{port}/")
    if settings.panel_password == "changeme":
        print("[!] 警告 — 正在使用默认密码 'changeme'，请立即通过环境变量更换：")
        print("    PowerShell: $env:ICLOUD_PANEL_PASSWORD='你的新密码'")
        print("    Linux/macOS: export ICLOUD_PANEL_PASSWORD='你的新密码'")
    else:
        print(f"[info] 面板密码已从环境变量 ICLOUD_PANEL_PASSWORD 加载")
    print(f"[info] 数据目录: {settings.data_dir}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[info] 已停止")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

