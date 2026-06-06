from __future__ import annotations

import html
import re
import urllib.parse


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)
SCRIPT_STYLE_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
SPACES_RE = re.compile(r"[ \t\r\f\v]+")
BLANK_LINES_RE = re.compile(r"\n{3,}")


def extract_email(line: str) -> str:
    match = EMAIL_RE.search(line)
    return match.group(0).lower() if match else ""


def clean_url(raw: str) -> str:
    text = str(raw or "").strip().strip("，,;；。")
    parsed = urllib.parse.urlparse(text)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return ""
    return text


def extract_url(line: str) -> str:
    match = URL_RE.search(line)
    return clean_url(match.group(0)) if match else ""


def source_host(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc
    except Exception:
        return ""


def html_to_text(value: str) -> str:
    text = str(value or "")
    text = SCRIPT_STYLE_RE.sub("\n", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(p|div|li|tr|h[1-6])>", "\n", text)
    text = TAG_RE.sub(" ", text)
    text = html.unescape(text)
    text = SPACES_RE.sub(" ", text)
    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(line for line in lines if line)
    return BLANK_LINES_RE.sub("\n\n", text).strip()

