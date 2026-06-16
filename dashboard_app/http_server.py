from __future__ import annotations

import hmac
import json
import mimetypes
import threading
import time
import urllib.parse
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from dashboard_app.config import settings
from dashboard_app.services.accounts import (
    account_stats,
    ensure_storage,
    find_account,
    load_accounts,
    public_account,
    public_accounts,
    remove_account,
)
from dashboard_app.services.cache import clear_cache, delete_cache, load_cache
from dashboard_app.services.importer import parse_import_text
from dashboard_app.services.mail_fetcher import cache_has_source_error, fetch_mail_for_account
from dashboard_app.services.scan_jobs import cancel_scan, retry_failed, scan_failed_ids, scan_status, start_scan, start_scan_all
from dashboard_app.services.sessions import issue_session, revoke_session, validate_session


_LOGIN_FAILURES: dict[str, list[float]] = {}
_LOGIN_FAILURE_LOCK = threading.RLock()


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "iCloudMailPanel/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        text = fmt % args if args else fmt
        print(f"[panel] {self.address_string()} {text}")

    def _send_bytes(
        self,
        data: bytes,
        content_type: str,
        status: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        extra = headers or {}
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if not any(key.lower() == "cache-control" for key in extra):
            self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; frame-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'")
        for key, value in extra.items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, payload: Any, status: int = 200, headers: dict[str, str] | None = None) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send_bytes(data, "application/json; charset=utf-8", status=status, headers=headers)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length > settings.max_json_body_bytes:
            raise ValueError("请求内容过大")
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        payload = json.loads(raw.decode("utf-8", errors="replace"))
        if not isinstance(payload, dict):
            raise ValueError("JSON 必须是对象")
        return payload

    def _session_token(self) -> str:
        jar = cookies.SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie") or "")
        except cookies.CookieError:
            return ""
        morsel = jar.get(settings.session_cookie)
        return morsel.value if morsel else ""

    def _authenticated(self) -> bool:
        return validate_session(self._session_token())

    def _require_auth(self) -> bool:
        if self._authenticated():
            return True
        self._send_json({"ok": False, "error": "未登录"}, status=401)
        return False

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/session":
            self._send_json({"ok": True, "authenticated": self._authenticated()})
            return
        if not path.startswith("/api/"):
            self._serve_frontend(path)
            return
        if not self._require_auth():
            return

        if path == "/api/state":
            accounts = load_accounts()
            self._send_json({
                "ok": True,
                "stats": account_stats(accounts),
                "accounts": public_accounts(accounts),
                "scan": scan_status(),
            })
            return
        if path == "/api/scan_status":
            self._send_json({"ok": True, "scan": scan_status()})
            return
        if path == "/api/scan_failed_ids":
            self._send_json({"ok": True, "failed_ids": scan_failed_ids()})
            return
        if path == "/api/account":
            account_id = (query.get("id") or [""])[0]
            _, account = find_account(account_id)
            if not account:
                self._send_json({"ok": False, "error": "邮箱不存在"}, status=404)
                return
            cache = load_cache(account_id)
            needs_source_refresh = cache_has_source_error(cache) or _cache_needs_source_snapshot(cache)
            if needs_source_refresh and account.get("source_url"):
                refreshed = fetch_mail_for_account(account_id, force=True, record_error=False)
                if refreshed.get("ok"):
                    self._send_json(refreshed)
                    return
                _, account = find_account(account_id)
                cache = load_cache(account_id)
            self._send_json({"ok": True, "account": public_account(account), "cache": cache})
            return

        self._send_json({"ok": False, "error": "Not found"}, status=404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            payload = self._read_json()
        except Exception as exc:
            self._send_json({"ok": False, "error": str(exc)}, status=400)
            return

        if path == "/api/login":
            self._handle_login(payload)
            return
        if path == "/api/logout":
            self._handle_logout()
            return
        if not path.startswith("/api/"):
            self._send_json({"ok": False, "error": "Not found"}, status=404)
            return
        if not self._require_auth():
            return

        if path == "/api/import":
            text = str(payload.get("text") or "")
            if not text.strip():
                self._send_json({"ok": False, "error": "导入内容为空"}, status=400)
                return
            result = parse_import_text(text)
            result["scan"] = start_scan(result.get("scan_ids") or [], reason="import")
            self._send_json(result)
            return
        if path == "/api/scan_start":
            scope = str(payload.get("scope") or "all").strip().lower()
            if scope == "ids":
                raw_ids = payload.get("ids") if isinstance(payload.get("ids"), list) else []
                scan = start_scan([str(item) for item in raw_ids], reason="manual_ids")
            else:
                scan = start_scan_all(reason="manual_all")
            self._send_json({"ok": True, "scan": scan})
            return
        if path == "/api/fetch_mail":
            self._send_json(fetch_mail_for_account(str(payload.get("id") or ""), force=bool(payload.get("force"))))
            return
        if path == "/api/scan_cancel":
            self._send_json(cancel_scan())
            return
        if path == "/api/retry_failed":
            self._send_json(retry_failed())
            return
        if path == "/api/delete_account":
            account_id = str(payload.get("id") or "")
            removed, accounts = remove_account(account_id)
            if not removed:
                self._send_json({"ok": False, "error": "邮箱不存在"}, status=404)
                return
            self._send_json({"ok": True, "stats": account_stats(accounts), "accounts": public_accounts(accounts)})
            return
        if path == "/api/clear_cache":
            account_id = str(payload.get("id") or "")
            delete_cache(account_id) if account_id else clear_cache()
            self._send_json({"ok": True})
            return

        self._send_json({"ok": False, "error": "Not found"}, status=404)

    def _handle_login(self, payload: dict[str, Any]) -> None:
        client = self.client_address[0] if self.client_address else "local"
        now = time.time()
        with _LOGIN_FAILURE_LOCK:
            failures = [ts for ts in _LOGIN_FAILURES.get(client, []) if now - ts < 60]
            _LOGIN_FAILURES[client] = failures
            failure_count = len(failures)
        if failure_count >= 8:
            self._send_json({"ok": False, "error": "登录失败次数过多，请稍后再试"}, status=429)
            return

        password = str(payload.get("password") or "")
        if not hmac.compare_digest(password, settings.panel_password):
            with _LOGIN_FAILURE_LOCK:
                failures = [ts for ts in _LOGIN_FAILURES.get(client, []) if now - ts < 60]
                failures.append(now)
                _LOGIN_FAILURES[client] = failures
                failure_count = len(failures)
            time.sleep(min(0.25 * failure_count, 1.5))
            self._send_json({"ok": False, "error": "密码不正确"}, status=403)
            return
        with _LOGIN_FAILURE_LOCK:
            _LOGIN_FAILURES.pop(client, None)
        token = issue_session()
        cookie = (
            f"{settings.session_cookie}={token}; Path=/; Max-Age={settings.session_ttl_seconds}; "
            "HttpOnly; SameSite=Lax"
        )
        self._send_json({"ok": True}, headers={"Set-Cookie": cookie})

    def _handle_logout(self) -> None:
        revoke_session(self._session_token())
        cookie = f"{settings.session_cookie}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
        self._send_json({"ok": True}, headers={"Set-Cookie": cookie})

    def _serve_frontend(self, url_path: str) -> None:
        web_dir = settings.web_dir
        index_file = web_dir / "index.html"

        # If the Next.js export is missing, show a helpful message instead of a blank page.
        if not index_file.is_file():
            hint = (
                "前端尚未构建。请先在项目根目录运行 `npm install && npm run build` 生成 out/ 目录，"
                "或直接使用 `python start_panel.py` 自动构建。"
            )
            self._send_bytes(hint.encode("utf-8"), "text/plain; charset=utf-8", status=503)
            return

        rel = urllib.parse.unquote(url_path.lstrip("/"))
        if rel in {"", "index.html"}:
            self._send_file(index_file)
            return

        target = (web_dir / rel).resolve()
        try:
            target.relative_to(web_dir.resolve())
        except ValueError:
            self._send_json({"ok": False, "error": "Invalid path"}, status=400)
            return

        # Static export emits a per-route file; fall back to a trailing .html, then SPA index.
        if target.is_file():
            self._send_file(target)
            return
        html_variant = target.with_suffix(".html")
        if html_variant.is_file():
            self._send_file(html_variant)
            return
        # Unknown non-asset route: let the SPA handle it client-side.
        self._send_file(index_file)

    def _send_file(self, target: Path) -> None:
        mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if target.suffix == ".js":
            mime = "text/javascript"
        if target.suffix in {".js", ".css", ".html", ".json", ".svg"}:
            mime = f"{mime}; charset=utf-8"
        # Long-cache hashed Next.js assets, never cache HTML.
        cache = "public, max-age=31536000, immutable" if "/_next/static/" in target.as_posix() else "no-store"
        self._send_bytes(target.read_bytes(), mime, headers={"Cache-Control": cache})


def _cache_needs_original_html(cache: dict[str, Any] | None) -> bool:
    if not cache:
        return False
    if int(cache.get("render_version") or 0) < 5:
        return True
    content_type = str(cache.get("content_type") or "").lower()
    parse_mode = str(cache.get("parse_mode") or "").lower()
    if "html" not in content_type and parse_mode != "html":
        return False
    messages = cache.get("messages")
    if not isinstance(messages, list) or not messages:
        return False
    return not any(isinstance(message, dict) and message.get("html") for message in messages)


def _cache_needs_source_snapshot(cache: dict[str, Any] | None) -> bool:
    if not cache:
        return False
    if cache_has_source_error(cache):
        return True
    if not cache.get("raw_response"):
        messages = cache.get("messages")
        has_message_html = isinstance(messages, list) and any(
            isinstance(message, dict) and message.get("html") for message in messages
        )
        if not has_message_html:
            return True
    return _cache_needs_original_html(cache)


def create_server(host: str, port: int) -> ThreadingHTTPServer:
    ensure_storage()
    return ThreadingHTTPServer((host, port), DashboardHandler)
