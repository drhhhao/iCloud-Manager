from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from dashboard_app.config import settings
from dashboard_app.storage.json_store import ensure_dir, read_json, write_json


def cache_path(account_id: str) -> Path:
    safe = re.sub(r"[^a-f0-9]", "", str(account_id).lower())[:32]
    return settings.cache_dir / f"{safe}.json"


def has_cache(account_id: str) -> bool:
    return cache_path(account_id).is_file()


def load_cache(account_id: str) -> dict[str, Any] | None:
    payload = read_json(cache_path(account_id), None)
    return payload if isinstance(payload, dict) else None


def save_cache(account_id: str, payload: dict[str, Any]) -> None:
    ensure_dir(settings.cache_dir)
    write_json(cache_path(account_id), payload)


def delete_cache(account_id: str) -> None:
    path = cache_path(account_id)
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass


def clear_cache() -> None:
    ensure_dir(settings.cache_dir)
    for path in settings.cache_dir.glob("*.json"):
        try:
            path.unlink()
        except OSError:
            pass

