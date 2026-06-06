from __future__ import annotations

import random
import threading as _threading
import time
import urllib.error
import urllib.request
from typing import Any

from dashboard_app.config import settings
from dashboard_app.services.accounts import (
    STORE_LOCK,
    find_account,
    public_account,
    save_accounts,
)
from dashboard_app.services.cache import delete_cache, load_cache, save_cache
from dashboard_app.services.mail_parser import messages_from_response
from dashboard_app.services.time_utils import now_iso
from dashboard_app.utils.text import source_host

# per-host connection limiter (concurrent, not sequential)
_HOST_SEMAPHORES: dict[str, _threading.BoundedSemaphore] = {}
_HOST_MAX_CONCURRENT = 3  # max concurrent requests to the same host


def _acquire_host_slot(host: str) -> None:
    """Wait until we can make a request to this host without exceeding concurrency limit."""
    if host not in _HOST_SEMAPHORES:
        _HOST_SEMAPHORES[host] = _threading.BoundedSemaphore(_HOST_MAX_CONCURRENT)
    _HOST_SEMAPHORES[host].acquire()


def _release_host_slot(host: str) -> None:
    """Release a slot for this host."""
    sem = _HOST_SEMAPHORES.get(host)
    if sem:
        sem.release()


def fetch_mail_for_account(account_id: str, force: bool = False) -> dict[str, Any]:
    # ── cache check (read-only, no lock needed) ──
    accounts, account = find_account(account_id)
    if not account:
        return {"ok": False, "error": "邮箱不存在"}
    if not force:
        cached = load_cache(account_id)
        if cached:
            if cache_has_source_error(cached):
                delete_cache(account_id)
            else:
                cached["cached"] = True
                return {"ok": True, "account": public_account(account), "cache": cached}

    source_url = str(account.get("source_url") or "").strip()
    email = str(account.get("email") or account_id)
    if not source_url:
        account["last_error"] = "缺少收信链接"
        with STORE_LOCK:
            accounts2, account2 = find_account(account_id)
            if account2:
                account2["last_error"] = "缺少收信链接"
                save_accounts(accounts2)
        return {"ok": False, "error": "缺少收信链接", "email": email}

    # ── HTTP fetch with retry ──
    last_error = ""
    last_status = 0
    for attempt in range(settings.fetch_retries + 1):
        if attempt > 0:
            if last_status in (502, 503, 504, 429):
                # aggressive exponential backoff for server errors
                delay = 2.0 * (2 ** (attempt - 1)) + random.uniform(0, 1)
                time.sleep(delay)  # ~2s, 4s, 8s, 16s
            else:
                # gentler backoff for timeouts
                delay = 1.0 * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
                time.sleep(delay)  # ~1s, 2s, 4s, 8s

        try:
            raw, status_code, content_type = _do_fetch(source_url)
        except urllib.error.HTTPError as exc:
            last_status = int(getattr(exc, "code", 500))
            last_error = f"收信链接返回 HTTP {last_status}"
            if last_status in (502, 503, 504, 429):
                continue  # retry on server errors
            if last_status >= 500:
                continue  # retry on any 5xx
            break
        except Exception as exc:
            last_status = 0
            last_error = f"拉取失败：{exc}"
            msg_lower = str(exc).lower()
            if any(kw in msg_lower for kw in ("timed out", "timeout", "time")):
                continue  # retry on timeout
            if any(kw in msg_lower for kw in ("connection", "reset", "refused", "unreachable")):
                continue  # retry on connection errors
            break
        else:
            # success — parse and save
            return _process_response(account_id, account, source_url, raw, status_code, content_type)

    # all attempts failed
    return _mark_fetch_error(account_id, last_error)


def _do_fetch(source_url: str) -> tuple[bytes, int, str]:
    from urllib.parse import urlparse
    host = urlparse(source_url).netloc or "unknown"
    acquired = False
    try:
        _acquire_host_slot(host)
        acquired = True
        request = urllib.request.Request(
            source_url,
            headers={
                "User-Agent": "iCloud-Mail-Panel/1.0",
                "Accept": "application/json,text/html,text/plain,*/*",
            },
        )
        with urllib.request.urlopen(request, timeout=settings.fetch_timeout_seconds) as response:
            raw = response.read(settings.max_fetch_bytes + 1)
            if len(raw) > settings.max_fetch_bytes:
                raise ValueError("响应内容超过 5MB，已停止读取")
            content_type = response.headers.get("Content-Type", "")
            status_code = int(getattr(response, "status", 200))
            return raw, status_code, content_type
    finally:
        if acquired:
            _release_host_slot(host)


def _process_response(
    account_id: str,
    account: dict[str, Any],
    source_url: str,
    raw: bytes,
    status_code: int,
    content_type: str,
) -> dict[str, Any]:
    charset = "utf-8"
    # try to detect charset from content-type header
    if "charset=" in content_type.lower():
        try:
            charset = content_type.lower().split("charset=")[-1].split(";")[0].strip()
        except Exception:
            charset = "utf-8"
    text = raw.decode(charset, errors="replace")

    no_history = _source_no_history_message(text)
    if no_history:
        return _mark_no_history(account_id, source_url, status_code, content_type, no_history)

    source_error = _source_error_message(text)
    if source_error:
        return _mark_fetch_error(account_id, source_error, clear_existing_cache=True, fetched=True)

    messages, parse_mode = messages_from_response(text, content_type, str(account.get("id")))
    for message in messages:
        if message.get("html"):
            message["base_url"] = source_url
    cache = {
        "render_version": 2,
        "account_id": account.get("id"),
        "email": account.get("email"),
        "source_host": source_host(source_url),
        "source_url": source_url,
        "fetched_at": now_iso(),
        "status_code": status_code,
        "content_type": content_type,
        "parse_mode": parse_mode,
        "message_count": len(messages),
        "messages": messages,
        "cached": False,
    }

    with STORE_LOCK:
        save_cache(str(account.get("id")), cache)
        accounts2, account2 = find_account(account_id)
        if account2:
            account2["last_fetch_at"] = cache["fetched_at"]
            account2["last_message_count"] = len(messages)
            account2["last_error"] = ""
            account2["mail_status"] = ""
            account2["updated_at"] = cache["fetched_at"]
            save_accounts(accounts2)
        return {"ok": True, "account": public_account(account2 or {}), "cache": cache}


def _source_no_history_message(text: str) -> str:
    normalized = " ".join(str(text or "").split()).lower()
    no_history_signals = (
        "no email found for recipient",
        "email not found",
        "mail not found",
    )
    if any(signal in normalized for signal in no_history_signals):
        return "无历史邮件"
    return ""


def _source_error_message(text: str) -> str:
    normalized = " ".join(str(text or "").split()).lower()
    if not normalized:
        return "收信链接返回空内容"
    error_signals = (
        ("recipient not found", "源站返回：没有找到收件人"),
    )
    for needle, message in error_signals:
        if needle in normalized:
            return message
    return ""


def cache_has_source_error(cache: dict[str, Any] | None) -> bool:
    if not cache:
        return False
    messages = cache.get("messages")
    if not isinstance(messages, list):
        return False
    for message in messages:
        if not isinstance(message, dict):
            continue
        html = str(message.get("html") or "")
        body = str(message.get("body") or "")
        if _source_no_history_message(f"{body}\n{html}") or _source_error_message(f"{body}\n{html}"):
            return True
    return False


def _mark_no_history(
    account_id: str,
    source_url: str,
    status_code: int,
    content_type: str,
    message: str,
) -> dict[str, Any]:
    fetched_at = now_iso()
    with STORE_LOCK:
        accounts, account = find_account(account_id)
        if not account:
            return {"ok": False, "error": "邮箱不存在"}
        cache = {
            "render_version": 2,
            "account_id": account.get("id"),
            "email": account.get("email"),
            "source_host": source_host(source_url),
            "source_url": source_url,
            "fetched_at": fetched_at,
            "status_code": status_code,
            "content_type": content_type,
            "parse_mode": "empty",
            "message_count": 0,
            "messages": [],
            "no_history": True,
            "message": message,
            "cached": False,
        }
        save_cache(str(account.get("id")), cache)
        account["last_fetch_at"] = fetched_at
        account["last_message_count"] = 0
        account["last_error"] = ""
        account["mail_status"] = "no_history"
        account["updated_at"] = fetched_at
        save_accounts(accounts)
        return {"ok": True, "account": public_account(account), "cache": cache}


def _mark_fetch_error(
    account_id: str,
    error: str,
    *,
    clear_existing_cache: bool = False,
    fetched: bool = False,
) -> dict[str, Any]:
    with STORE_LOCK:
        accounts, account = find_account(account_id)
        if account:
            if clear_existing_cache:
                delete_cache(account_id)
                account["last_message_count"] = 0
            if fetched:
                account["last_fetch_at"] = now_iso()
            account["last_error"] = error
            account["mail_status"] = ""
            account["updated_at"] = now_iso()
            save_accounts(accounts)
    return {"ok": False, "error": error, "email": (account or {}).get("email", account_id)}
