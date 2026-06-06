from __future__ import annotations

import argparse
import sys
import threading
import time
import webbrowser
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="iCloud 邮箱管理面板启动器")
    parser.add_argument("--host", default="127.0.0.1", help="绑定地址，默认 127.0.0.1")
    parser.add_argument("--port", type=int, default=8799, help="监听端口，默认 8799")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    parser.add_argument("--import-file", default="", help="启动前导入一个邮箱 txt 文件")
    parser.add_argument("--import-only", action="store_true", help="只导入文件，不启动面板")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    from dashboard_app.services.importer import import_text_file
    from dashboard_app.server import main as serve_main

    if args.import_file:
        result = import_text_file(args.import_file)
        stats = result.get("stats", {})
        print(
            "[ok] 导入完成："
            f"新增 {stats.get('imported', 0)}，"
            f"更新 {stats.get('updated', 0)}，"
            f"重复 {stats.get('duplicates', 0)}，"
            f"跳过非 iCloud {stats.get('skipped_non_icloud', 0)}，"
            f"无效 {stats.get('skipped_invalid', 0)}"
        )
        if args.import_only:
            return 0

    if not args.no_browser:
        url = f"http://{args.host if args.host != '0.0.0.0' else '127.0.0.1'}:{args.port}/"

        def open_later() -> None:
            time.sleep(0.8)
            try:
                webbrowser.open(url)
            except Exception:
                pass

        threading.Thread(target=open_later, daemon=True).start()

    return serve_main(host=args.host, port=args.port)


if __name__ == "__main__":
    raise SystemExit(main())
