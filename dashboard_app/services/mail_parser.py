from __future__ import annotations

import hashlib
import json
from typing import Any

from dashboard_app.utils.text import html_to_text


def _message_id(account_id: str, index: int, values: list[str]) -> str:
    raw = "|".join([account_id, str(index), *values])
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()[:18]


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value).strip()
    return json.dumps(value, ensure_ascii=False)


def _pick_raw(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    lowered = {str(key).lower(): value for key, value in item.items()}
    for key in keys:
        if key in lowered:
            text = _stringify(lowered[key])
            if text:
                return lowered[key]
    return ""


def _pick(item: dict[str, Any], keys: tuple[str, ...]) -> str:
    value = _pick_raw(item, keys)
    if not value:
        return ""
    return _stringify(value)


def _looks_like_html(value: Any) -> bool:
    text = _stringify(value)
    if not text:
        return False
    head = text[:3000].lower()
    return any(
        marker in head
        for marker in (
            "<!doctype",
            "<html",
            "<head",
            "<body",
            "<style",
            "<table",
            "<div",
            "<span",
            "<img",
            "<a ",
            "<p",
            "<br",
        )
    )


def _html_from_item(item: dict[str, Any], raw_body: Any) -> str:
    direct = _pick_raw(
        item,
        (
            "raw_html",
            "html",
            "body_html",
            "content_html",
            "email_html",
            "message_html",
        ),
    )
    if direct and _looks_like_html(direct):
        return _stringify(direct)
    if raw_body and _looks_like_html(raw_body):
        return _stringify(raw_body)
    return ""


def _looks_like_message(item: dict[str, Any]) -> bool:
    keys = {str(key).lower() for key in item.keys()}
    hints = {
        "subject",
        "title",
        "from",
        "sender",
        "body",
        "content",
        "html",
        "text",
        "date",
        "time",
        "received_at",
        "created_at",
    }
    return bool(keys & hints)


def _collect_message_candidates(payload: Any) -> list[Any]:
    candidates: list[Any] = []

    def walk(value: Any) -> None:
        if isinstance(value, list):
            for child in value:
                walk(child)
            return
        if isinstance(value, dict):
            if _looks_like_message(value):
                candidates.append(value)
                return
            for key in (
                "messages",
                "mails",
                "mail",
                "emails",
                "items",
                "rows",
                "list",
                "data",
                "result",
                "records",
            ):
                if key in value:
                    walk(value.get(key))
            return
        if isinstance(value, str) and value.strip():
            candidates.append(value)

    walk(payload)
    return candidates


def _normalize_message(account_id: str, index: int, item: Any) -> dict[str, Any]:
    html = ""
    if isinstance(item, dict):
        sender = _pick(item, ("from", "sender", "from_email", "from_name", "mail_from"))
        receiver = _pick(item, ("to", "receiver", "recipient", "mail_to"))
        subject = _pick(item, ("subject", "title", "name")) or "无主题"
        date = _pick(item, ("date", "time", "received_at", "created_at", "sent_at", "timestamp"))
        raw_body = _pick_raw(item, ("body", "content", "html", "text", "message", "detail", "value"))
        html = _html_from_item(item, raw_body)
        body = html_to_text(_stringify(raw_body)) if raw_body else ""
        if not body:
            body = html_to_text(json.dumps(item, ensure_ascii=False))
    else:
        sender = ""
        receiver = ""
        subject = "原始邮件内容"
        date = ""
        html = _stringify(item) if _looks_like_html(item) else ""
        body = html_to_text(str(item))

    message: dict[str, Any] = {
        "id": _message_id(account_id, index, [sender, receiver, subject, date, body[:300]]),
        "from": sender,
        "to": receiver,
        "subject": subject,
        "date": date,
        "body": body,
        "render_mode": "html" if html else "text",
    }
    if html:
        message["html"] = html
    return message


def messages_from_response(text: str, content_type: str, account_id: str) -> tuple[list[dict[str, Any]], str]:
    stripped = text.strip()
    if stripped:
        try:
            payload = json.loads(stripped)
            candidates = _collect_message_candidates(payload)
            messages = [_normalize_message(account_id, idx, item) for idx, item in enumerate(candidates)]
            return messages, "json"
        except json.JSONDecodeError:
            pass

    parse_mode = "html" if "html" in content_type.lower() else "text"
    if parse_mode == "html" or _looks_like_html(text):
        return [_normalize_message(account_id, 0, text)], parse_mode

    plain = html_to_text(text)
    if not plain:
        return [], "text"
    return [_normalize_message(account_id, 0, plain)], parse_mode
