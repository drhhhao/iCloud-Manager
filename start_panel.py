from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

DEFAULT_PORT = 17607


def _ensure_frontend(root: Path, force_build: bool = False) -> bool:
    """Ensure the Next.js static export exists in out/.

    Builds it automatically when missing (or when force_build is set) as long as
    a Node package manager is available. Returns True if the frontend is ready.
    """
    index_file = root / "out" / "index.html"
    if index_file.is_file() and not force_build:
        return True

    npm = shutil.which("npm")
    if not npm:
        print(
            "[!] 未找到 npm，无法自动构建前端。\n"
            "    请先安装 Node.js 后运行 `npm install && npm run build`，"
            "或在已构建好 out/ 的机器上运行本面板。"
        )
        return index_file.is_file()

    try:
        if not (root / "node_modules").is_dir():
            print("[info] 正在安装前端依赖（npm install）……")
            subprocess.run([npm, "install"], cwd=str(root), check=True)
        print("[info] 正在构建前端（npm run build）……")
        subprocess.run([npm, "run", "build"], cwd=str(root), check=True)
    except subprocess.CalledProcessError as exc:
        print(f"[!] 前端构建失败：{exc}")
        return index_file.is_file()

    return index_file.is_file()


def main() -> int:
    parser = argparse.ArgumentParser(description="iCloud 邮箱管理面板启动器")
    parser.add_argument("--host", default="127.0.0.1", help="绑定地址，默认 127.0.0.1")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"监听端口，默认 {DEFAULT_PORT}")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    parser.add_argument("--rebuild", action="store_true", help="强制重新构建前端")
    parser.add_argument("--skip-build", action="store_true", help="跳过前端构建检查")
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

    if not args.skip_build:
        if not _ensure_frontend(root, force_build=args.rebuild):
            print("[!] 前端未就绪，面板将显示构建提示页。")

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
