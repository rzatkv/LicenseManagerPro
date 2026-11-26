"""Outgoing mail (v3.0) — SMTP from the Settings → Email config.

Config is one JSON setting, `email_config`:

    {"smtp_host": "...", "smtp_port": 587, "encryption": "tls"|"ssl"|"none",
     "username": "...", "password": "...",
     "from_address": "...", "from_name": "...",
     "templates": {...}, "signature": "..."}

Credentials are server-side only: the admin endpoint never returns
the password (only `password_configured`). `send_mail` renders no
templates itself — callers pass a rendered subject/body (see
services/templates.py). Failures return False, never raise.
"""
import json
import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from services.settings import get_setting_default

logger = logging.getLogger(__name__)

_DEFAULT_CONFIG = {
    "smtp_host": "",
    "smtp_port": 587,
    "encryption": "tls",
    "username": "",
    "password": "",
    "from_address": "",
    "from_name": "",
}


def get_email_config(db: Session) -> dict:
    """Full config (server-side only; contains the password)."""
    try:
        cfg = json.loads(get_setting_default(db, "email_config", "{}") or "{}")
    except (ValueError, TypeError):
        cfg = {}
    merged = dict(_DEFAULT_CONFIG)
    merged.update(cfg)
    return merged


def public_email_config(db: Session) -> dict:
    """What the admin UI may see: everything except the password, plus
    `password_configured` and the editable templates + signature."""
    from services.templates import get_signature, get_templates

    cfg = get_email_config(db)
    return {
        "smtp_host": cfg.get("smtp_host", ""),
        "smtp_port": cfg.get("smtp_port", 587),
        "encryption": cfg.get("encryption", "tls"),
        "username": cfg.get("username", ""),
        "password_configured": bool(cfg.get("password")),
        "from_address": cfg.get("from_address", ""),
        "from_name": cfg.get("from_name", ""),
        "templates": get_templates(db),
        "signature": get_signature(db),
    }


def set_email_config(db: Session, payload: dict) -> dict:
    """Merge an admin update. Empty password keeps the stored one;
    "__CLEAR__" removes it. `reset_templates: true` restores the
    default templates + signature. Unknown top-level fields are
    rejected."""
    from services.settings import update_setting

    allowed = {
        "smtp_host", "smtp_port", "encryption", "username", "password",
        "from_address", "from_name", "templates", "signature",
        "reset_templates",
    }
    for key in payload:
        if key not in allowed:
            raise ValueError(f"Unknown email setting: {key!r}")
    cfg = get_email_config(db)
    if payload.get("reset_templates"):
        cfg.pop("templates", None)
        cfg.pop("signature", None)
    for key in ("smtp_host", "username", "from_address", "from_name", "signature"):
        if payload.get(key) is not None:
            cfg[key] = str(payload[key])
    if payload.get("smtp_port") is not None:
        port = int(payload["smtp_port"])
        if not 1 <= port <= 65535:
            raise ValueError("smtp_port must be 1-65535")
        cfg["smtp_port"] = port
    if payload.get("encryption") is not None:
        if payload["encryption"] not in ("none", "tls", "ssl"):
            raise ValueError("encryption must be none, tls or ssl")
        cfg["encryption"] = payload["encryption"]
    if payload.get("password") is not None:
        if payload["password"] == "__CLEAR__":
            cfg["password"] = ""
        elif payload["password"] != "":
            cfg["password"] = str(payload["password"])
    if payload.get("templates") is not None:
        from services.templates import DEFAULT_TEMPLATES

        templates = payload["templates"]
        if not isinstance(templates, dict):
            raise ValueError("templates must be an object")
        stored = cfg.get("templates") or {}
        for name, tpl in templates.items():
            if name not in DEFAULT_TEMPLATES or not isinstance(tpl, dict):
                raise ValueError(f"Unknown template: {name!r}")
            stored[name] = {
                "subject": str(tpl.get("subject", "")),
                "body": str(tpl.get("body", "")),
            }
        cfg["templates"] = stored
    update_setting(db, "email_config", json.dumps(cfg))
    return public_email_config(db)


def send_mail(db: Session, to: str, subject: str, body: str) -> bool:
    """Send one email via the configured SMTP server. Returns False
    when mail is not configured or the send fails (logged, never
    raised). `create_smtp_client` is the monkeypatch point for tests."""
    cfg = get_email_config(db)
    host = (cfg.get("smtp_host") or "").strip()
    if not host or not to:
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = (
        f"{cfg.get('from_name') or ''} <{cfg.get('from_address') or cfg.get('username') or ''}>"
        if cfg.get("from_address") or cfg.get("username")
        else "noreply@localhost"
    )
    msg["To"] = to
    msg.set_content(body)
    try:
        client = create_smtp_client(cfg)
        client.send_message(msg)
        client.quit()
        return True
    except Exception as exc:  # noqa: BLE001 - mail failure must not break callers
        logger.warning("Mail send to %s failed: %s", to, exc)
        return False


def create_smtp_client(cfg: dict):
    """Factory for the SMTP connection (monkeypatch point for tests)."""
    encryption = cfg.get("encryption", "tls")
    port = int(cfg.get("smtp_port") or 587)
    if encryption == "ssl":
        client = smtplib.SMTP_SSL(cfg["smtp_host"], port, timeout=15)
    else:
        client = smtplib.SMTP(cfg["smtp_host"], port, timeout=15)
        if encryption == "tls":
            client.starttls()
    if cfg.get("username") and cfg.get("password"):
        client.login(cfg["username"], cfg["password"])
    return client
