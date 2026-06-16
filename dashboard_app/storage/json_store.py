from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any


_WRITE_LOCKS: dict[str, threading.RLock] = {}
_WRITE_LOCKS_LOCK = threading.RLock()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def chmod_private(path: Path) -> None:
    if os.name == "nt":
        return
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def read_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    ensure_parent(path)
    lock_key = str(path.resolve())
    with _WRITE_LOCKS_LOCK:
        lock = _WRITE_LOCKS.setdefault(lock_key, threading.RLock())
    with lock:
        data = json.dumps(payload, ensure_ascii=False, indent=2)
        tmp = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
        tmp.write_text(data, encoding="utf-8")
        last_error: OSError | None = None
        for attempt in range(6):
            try:
                tmp.replace(path)
                chmod_private(path)
                return
            except OSError as exc:
                last_error = exc
                time.sleep(0.05 * (attempt + 1))
        try:
            tmp.unlink()
        except OSError:
            pass
        if last_error:
            raise last_error
