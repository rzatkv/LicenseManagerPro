"""Telegram bot notifications (v3.0).

Config is one JSON setting, `telegram_config`:

    {"bot_token": "...", "chat_ids": ["123456789", "-1001234567890"]}

The bot token is server-side only: the admin endpoint returns only
`token_configured`, never the token. `send_telegram` posts to the
Telegram Bot API `sendMessage` for every configured chat. Failures
return False, never raise. No live Telegram dependency in tests —
`create_telegram_client` is the monkeypatch point.
"""
import json
import logging

import httpx
from sqlalchemy.orm import Session

from services.settings import get_setting_default

logger = logging.getLogger(__name__)


def get_telegram_config(db: Session) -> dict:
    """Full config (server-side only; contains the bot token)."""
    try:
        cfg = json.loads(get_setting_default(db, "telegram_config", "{}") or "{}")
    except (ValueError, TypeError):
        cfg = {}
    return {"bot_token": cfg.get("bot_token") or "", "chat_ids": cfg.get("chat_ids") or []}


def public_telegram_config(db: Session) -> dict:
    cfg = get_telegram_config(db)
    return {
        "token_configured": bool(cfg.get("bot_token")),
        "chat_ids": list(cfg.get("chat_ids") or []),
    }


def set_telegram_config(db: Session, payload: dict) -> dict:
    """Merge an admin update. Empty bot_token keeps the stored one;
    "__CLEAR__" removes it. chat_ids must be a list of strings/ints."""
    from services.settings import update_setting

    for key in payload:
        if key not in ("bot_token", "chat_ids"):
            raise ValueError(f"Unknown telegram setting: {key!r}")
    cfg = get_telegram_config(db)
    if payload.get("bot_token") is not None:
        if payload["bot_token"] == "__CLEAR__":
            cfg["bot_token"] = ""
        elif payload["bot_token"] != "":
            cfg["bot_token"] = str(payload["bot_token"])
    if payload.get("chat_ids") is not None:
        chat_ids = payload["chat_ids"]
        if isinstance(chat_ids, str):
            chat_ids = [c.strip() for c in chat_ids.replace("\n", ",").split(",") if c.strip()]
        if not isinstance(chat_ids, list) or any(
            not isinstance(c, (str, int)) for c in chat_ids
        ):
            raise ValueError("chat_ids must be a list of chat IDs")
        cfg["chat_ids"] = [str(c) for c in chat_ids]
    update_setting(db, "telegram_config", json.dumps(cfg))
    return public_telegram_config(db)


def send_telegram(db: Session, text: str) -> bool:
    """Send `text` to every configured chat via the stored bot token.
    Returns True only when every chat accepted the message; False when
    the token/chats are missing or any call fails (logged, never
    raised)."""
    cfg = get_telegram_config(db)
    token = cfg.get("bot_token") or ""
    chat_ids = cfg.get("chat_ids") or []
    if not token or not chat_ids:
        return False
    try:
        client = create_telegram_client()
        ok = True
        for chat_id in chat_ids:
            resp = client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text},
                timeout=15,
            )
            if resp.status_code != 200:
                ok = False
                logger.warning(
                    "Telegram sendMessage to %s failed: HTTP %s",
                    chat_id, resp.status_code,
                )
        return ok
    except Exception as exc:  # noqa: BLE001 - send failure must not break callers
        logger.warning("Telegram send failed: %s", exc)
        return False


def create_telegram_client() -> httpx.Client:
    """Factory for the HTTP client (monkeypatch point for tests)."""
    return httpx.Client(trust_env=False, timeout=15)
