"""Panel news (v3.0.5; public).

GET /api/news reads the repo-root news.json file — the panel operator
publishes news by editing that one file in GitHub (see README,
"Publishing news"). The file is cached by mtime, and the endpoint can
never break the app: a missing file, invalid JSON or a wrong shape all
return an empty list instead of an error.

Item shape (both languages, so the panel renders news in the admin's
language without a translation round-trip):
  {"id": str, "title": {"en": str, "fa": str}, "body": {"en": str, "fa": str},
   "date": "YYYY-MM-DD", "link": optional str}
A plain-string title/body is accepted too and used for both languages.
"""

import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()

NEWS_FILE = Path(__file__).resolve().parent.parent.parent / "news.json"

_cache = {"mtime": None, "items": []}


def _normalize_text(value):
    """Accept {"en": .., "fa": ..} or a plain string; always return both."""
    if isinstance(value, dict):
        en = str(value.get("en") or value.get("fa") or "")
        fa = str(value.get("fa") or value.get("en") or "")
        return {"en": en, "fa": fa}
    text = str(value or "")
    return {"en": text, "fa": text}


def _load_items():
    try:
        mtime = NEWS_FILE.stat().st_mtime
    except OSError:
        return []
    if _cache["mtime"] == mtime:
        return _cache["items"]
    try:
        data = json.loads(NEWS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeDecodeError):
        _cache["mtime"] = mtime
        _cache["items"] = []
        return []
    raw = data.get("items") if isinstance(data, dict) else None
    items = []
    if isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            title = _normalize_text(entry.get("title"))
            body = _normalize_text(entry.get("body"))
            if not title["en"] and not title["fa"]:
                continue
            items.append({
                "id": str(entry.get("id") or len(items)),
                "title": title,
                "body": body,
                "date": str(entry.get("date") or ""),
                "link": str(entry.get("link") or "") or None,
            })
    _cache["mtime"] = mtime
    _cache["items"] = items
    return items


@router.get("")
def list_news():
    """Panel news, newest first. PUBLIC (v3.0.5): news is meant to be
    read by every panel user, and the same file is public on GitHub."""
    return {"items": _load_items()}
