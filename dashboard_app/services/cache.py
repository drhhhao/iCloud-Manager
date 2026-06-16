from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from dashboard_app.config import settings
from dashboard_app.services.mail_parser import messages_from_response
from dashboard_app.storage.json_store import ensure_dir, read_json, write_json

_DELETED_CACHE = {"_deleted": True}


def cache_path(account_id: str) -> Path:
    safe = re.sub(r"[^a-f0-9]", "", str(account_id).lower())[:32]
    return settings.cache_dir / f"{safe}.json"


def has_cache(account_id: str) -> bool:
    payload = read_json(cache_path(account_id), None)
    return isinstance(payload, dict) and not payload.get("_deleted")


def cache_summaries(account_ids: list[str]) -> dict[str, dict[str, Any]]:
    summaries: dict[str, dict[str, Any]] = {}
    for account_id in account_ids:
        path = cache_path(account_id)
        if not path.is_file():
            continue
        payload = read_json(path, {})
        if not isinstance(payload, dict) or payload.get("_deleted"):
            continue
        summaries[account_id] = {
            "cached": True,
            "no_history": bool(payload.get("no_history")),
        }
    return summaries


def load_cache(account_id: str) -> dict[str, Any] | None:
    payload = read_json(cache_path(account_id), None)
    if not isinstance(payload, dict) or payload.get("_deleted"):
        return None
    repaired, changed = _repair_legacy_json_body_cache(payload)
    if changed:
        save_cache(account_id, repaired)
    return repaired


def save_cache(account_id: str, payload: dict[str, Any]) -> None:
    ensure_dir(settings.cache_dir)
    write_json(cache_path(account_id), payload)


def delete_cache(account_id: str) -> None:
    path = cache_path(account_id)
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        write_json(path, _DELETED_CACHE)


def clear_cache() -> None:
    ensure_dir(settings.cache_dir)
    for path in settings.cache_dir.glob("*.json"):
        try:
            path.unlink()
        except OSError:
            write_json(path, _DELETED_CACHE)


def _repair_legacy_json_body_cache(payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        return payload, False

    repaired_messages: list[dict[str, Any]] = []
    changed = False
    account_id = str(payload.get("account_id") or "")
    for index, message in enumerate(messages):
        if not isinstance(message, dict):
            continue
        body = str(message.get("body") or "").strip()
        if not body.startswith("{"):
            repaired_messages.append(message)
            continue
        try:
            parsed_messages, _ = messages_from_response(body, "application/json; charset=utf-8", account_id)
        except Exception:
            repaired_messages.append(message)
            continue
        if not parsed_messages:
            repaired_messages.append(message)
            continue
        repaired = parsed_messages[0]
        repaired["id"] = message.get("id") or repaired.get("id") or f"{account_id}-{index}"
        if not repaired.get("from"):
            repaired["from"] = message.get("from", "")
        if not repaired.get("to"):
            repaired["to"] = message.get("to", "")
        if not repaired.get("date"):
            repaired["date"] = message.get("date", "")
        if message.get("base_url") and repaired.get("html"):
            repaired["base_url"] = message.get("base_url")
        repaired_messages.append(repaired)
        changed = True

    if not changed:
        return payload, False
    repaired_payload = dict(payload)
    repaired_payload["render_version"] = 5
    repaired_payload["messages"] = repaired_messages
    repaired_payload["message_count"] = len(repaired_messages)
    return repaired_payload, True
