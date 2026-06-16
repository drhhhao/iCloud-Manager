from __future__ import annotations

import hashlib
import threading
from typing import Any

from dashboard_app.config import settings
from dashboard_app.services.cache import cache_summaries, delete_cache, has_cache
from dashboard_app.services.time_utils import now_iso
from dashboard_app.storage.json_store import ensure_dir, read_json, write_json
from dashboard_app.utils.text import source_host


STORE_LOCK = threading.RLock()


def ensure_storage() -> None:
    ensure_dir(settings.data_dir)
    ensure_dir(settings.cache_dir)


def account_id(email: str) -> str:
    return hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:16]


def load_accounts() -> list[dict[str, Any]]:
    payload = read_json(settings.accounts_path, {"accounts": []})
    accounts = payload.get("accounts") if isinstance(payload, dict) else payload
    if not isinstance(accounts, list):
        return []
    return [item for item in accounts if isinstance(item, dict) and item.get("email")]


def save_accounts(accounts: list[dict[str, Any]]) -> None:
    ensure_storage()
    write_json(settings.accounts_path, {"updated_at": now_iso(), "accounts": accounts})


def find_account(account_id_value: str) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    accounts = load_accounts()
    for account in accounts:
        if str(account.get("id")) == str(account_id_value):
            return accounts, account
    return accounts, None


def public_account(account: dict[str, Any], cache_summary: dict[str, Any] | None = None) -> dict[str, Any]:
    source_url = str(account.get("source_url") or "")
    item_id = str(account.get("id", ""))
    summary = cache_summary if cache_summary is not None else _single_cache_summary(item_id)
    no_history = bool(account.get("mail_status") == "no_history" or summary.get("no_history"))
    return {
        "id": item_id,
        "email": account.get("email", ""),
        "source_host": account.get("source_host") or source_host(source_url),
        "has_source": bool(source_url),
        "created_at": account.get("created_at", ""),
        "updated_at": account.get("updated_at", ""),
        "last_fetch_at": account.get("last_fetch_at", ""),
        "last_message_count": int(account.get("last_message_count") or 0),
        "last_error": account.get("last_error", ""),
        "cached": bool(summary.get("cached")),
        "no_history": no_history,
    }


def public_accounts(accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries = cache_summaries([str(account.get("id", "")) for account in accounts])
    return [public_account(account, summaries.get(str(account.get("id", "")), {})) for account in accounts]


def account_stats(accounts: list[dict[str, Any]]) -> dict[str, int]:
    summaries = cache_summaries([str(item.get("id", "")) for item in accounts])
    return {
        "total": len(accounts),
        "with_source": sum(1 for item in accounts if item.get("source_url")),
        "cached": len(summaries),
        "errors": sum(1 for item in accounts if item.get("last_error")),
        "messages": sum(int(item.get("last_message_count") or 0) for item in accounts),
    }


def _single_cache_summary(account_id_value: str) -> dict[str, Any]:
    summary = cache_summaries([account_id_value]).get(account_id_value)
    if summary is not None:
        return summary
    return {"cached": has_cache(account_id_value), "no_history": False}


def remove_account(account_id_value: str) -> tuple[bool, list[dict[str, Any]]]:
    with STORE_LOCK:
        accounts = load_accounts()
        kept = [item for item in accounts if str(item.get("id")) != account_id_value]
        if len(kept) == len(accounts):
            return False, accounts
        save_accounts(kept)
        delete_cache(account_id_value)
        return True, kept
