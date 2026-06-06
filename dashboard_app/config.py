from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    root: Path
    package_dir: Path
    data_dir: Path
    cache_dir: Path
    accounts_path: Path
    template_path: Path
    static_dir: Path
    panel_password: str
    session_cookie: str = "ICLOUD_PANEL_SESSION"
    session_ttl_seconds: int = 7 * 24 * 60 * 60
    max_json_body_bytes: int = 24 * 1024 * 1024
    max_fetch_bytes: int = 5 * 1024 * 1024
    scan_workers: int = 5
    fetch_timeout_seconds: int = 25
    fetch_retries: int = 4
    retry_pass_delay: int = 30  # seconds to wait before auto retry pass
    max_retry_passes: int = 3  # max auto retry phases


PACKAGE_DIR = Path(__file__).resolve().parent
ROOT = PACKAGE_DIR.parent


settings = Settings(
    root=ROOT,
    package_dir=PACKAGE_DIR,
    data_dir=ROOT / "data",
    cache_dir=ROOT / "data" / "mail_cache",
    accounts_path=ROOT / "data" / "accounts.json",
    template_path=PACKAGE_DIR / "templates" / "index.html",
    static_dir=PACKAGE_DIR / "static",
    panel_password=os.environ.get("ICLOUD_PANEL_PASSWORD", "changeme"),
    scan_workers=max(1, min(int(os.environ.get("ICLOUD_SCAN_WORKERS", "5")), 16)),
    fetch_timeout_seconds=max(5, min(int(os.environ.get("ICLOUD_FETCH_TIMEOUT", "25")), 90)),
    fetch_retries=max(0, min(int(os.environ.get("ICLOUD_FETCH_RETRIES", "4")), 8)),
    retry_pass_delay=max(5, min(int(os.environ.get("ICLOUD_RETRY_DELAY", "30")), 300)),
    max_retry_passes=max(1, min(int(os.environ.get("ICLOUD_MAX_RETRY_PASSES", "3")), 10)),
)
