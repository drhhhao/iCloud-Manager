from __future__ import annotations

import secrets
import time

from dashboard_app.config import settings


_sessions: dict[str, float] = {}


def issue_session() -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = time.time() + settings.session_ttl_seconds
    return token


def validate_session(token: str) -> bool:
    expires = _sessions.get(token)
    if not expires:
        return False
    if expires < time.time():
        _sessions.pop(token, None)
        return False
    _sessions[token] = time.time() + settings.session_ttl_seconds
    return True


def revoke_session(token: str) -> None:
    if token:
        _sessions.pop(token, None)

