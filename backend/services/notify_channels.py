"""Per-event notification channels (v3.0).

Every event the system notifies about has a separate toggle for each
outbound channel — email, SMS, Telegram — stored as one JSON setting,
`notification_channels`:

    {"license_created":  {"email": true,  "sms": false, "telegram": false},
     "license_expiring": {"email": true,  "sms": false, "telegram": false},
     ...}

Defaults: email ON for every event, SMS and Telegram OFF (they cost
money / need configuration). `notify_event()` writes the in-app
notification FIRST (the bell is unaffected by these toggles — it
always fires), then sends on each enabled channel. A disabled channel
sends NOTHING for that event. Channel failures are logged and never
break the triggering action.

Events covered (every notify() call site in the codebase):
license_created, license_reissued, license_expiring, license_expired,
webhook_failed, webhook_blocked, user_created, api_key_expiring.

Email uses the stored templates when one matches the event
(license_created / license_renewed / license_expiring /
license_expired / user_created); other events send a plain
subject/body email. SMS goes to admins with a phone number;
Telegram goes to the configured chats.
"""
import json
import logging

from sqlalchemy.orm import Session

from models import User
from services.audit import log_audit
from services.notifications import notify_admins
from services.settings import get_setting_default

logger = logging.getLogger(__name__)

EVENTS = (
    "license_created",
    "license_reissued",
    "license_expiring",
    "license_expired",
    "webhook_failed",
    "webhook_blocked",
    "user_created",
    "api_key_expiring",
)

CHANNELS = ("email", "sms", "telegram")

# Events that have a matching email template (license_reissued reuses
# the license_renewed template).
EVENT_TEMPLATE = {
    "license_created": "license_created",
    "license_reissued": "license_renewed",
    "license_expiring": "license_expiring",
    "license_expired": "license_expired",
    "user_created": "user_created",
}


def default_channels() -> dict:
    return {event: {"email": True, "sms": False, "telegram": False} for event in EVENTS}


def get_notification_channels(db: Session) -> dict:
    """Stored matrix merged over the defaults (unknown events/channels
    are ignored)."""
    try:
        stored = json.loads(get_setting_default(db, "notification_channels", "{}") or "{}")
    except (ValueError, TypeError):
        stored = {}
    merged = default_channels()
    for event, channels in (stored or {}).items():
        if event in merged and isinstance(channels, dict):
            for channel in CHANNELS:
                if channel in channels:
                    merged[event][channel] = bool(channels[channel])
    return merged


def set_notification_channels(db: Session, matrix: dict) -> dict:
    """Replace the stored matrix (validated: known events, known
    channels, booleans). Returns the merged matrix."""
    from services.settings import update_setting

    if not isinstance(matrix, dict):
        raise ValueError("notification channels must be an object")
    cleaned = {}
    for event, channels in matrix.items():
        if event not in EVENTS:
            raise ValueError(f"Unknown notification event: {event!r}")
        if not isinstance(channels, dict):
            raise ValueError(f"Channels for {event!r} must be an object")
        cleaned[event] = {}
        for channel, enabled in channels.items():
            if channel not in CHANNELS:
                raise ValueError(f"Unknown channel: {channel!r}")
            cleaned[event][channel] = bool(enabled)
    update_setting(db, "notification_channels", json.dumps(cleaned))
    return get_notification_channels(db)


def _admin_contacts(db: Session) -> tuple[list[str], list[str]]:
    """(admin emails, admin phone numbers) for outbound sends."""
    admins = db.query(User).filter(User.role == "admin", User.is_active == True).all()  # noqa: E712
    emails = [u.email for u in admins if u.email]
    phones = [u.phone for u in admins if (u.phone or "").strip()]
    return emails, phones


def notify_event(
    db: Session,
    event: str,
    title: str,
    message: str,
    type_: str = "info",
    link: str | None = None,
    context: dict | None = None,
):
    """In-app notification (always) + outbound sends per the channel
    matrix for `event`. `context` carries template variables
    (license_key, product_name, expiry_date, days_left, user_email,
    role) for the email templates."""
    notify_admins(db, title, message, type_=type_, link=link)
    if event not in EVENTS:
        logger.warning("notify_event called with unknown event %r", event)
        return
    channels = get_notification_channels(db)[event]
    if not any(channels.values()):
        return
    ctx = context or {}
    if channels["email"]:
        _send_email(db, event, title, message, ctx)
    if channels["sms"]:
        _send_sms(db, event, title, message)
    if channels["telegram"]:
        _send_telegram(db, event, title, message)


def _log_send(db: Session, channel: str, event: str, ok: bool, to: str) -> None:
    """Per-channel log (v3.0): every outbound send is recorded in the
    audit trail as `notify.<channel>_sent|failed` with the channel in
    the details, so the Logs page can filter one channel's stream.
    Actor is "system" — these are machine sends, not admin actions."""
    log_audit(
        db,
        "system",
        f"notify.{channel}_{'sent' if ok else 'failed'}",
        "notification",
        None,
        {"event": event, "channel": channel, "to": to},
    )


def _send_email(db: Session, event: str, title: str, message: str, ctx: dict) -> None:
    from services import mail as mail_service
    from services.templates import render_template

    template = EVENT_TEMPLATE.get(event)
    if template:
        subject, body = render_template(db, template, ctx)
    else:
        subject, body = title, message + "\n"
        from services.templates import get_signature

        signature = get_signature(db)
        if signature:
            body = body.rstrip("\n") + "\n\n" + signature + "\n"
    for email in _admin_contacts(db)[0]:
        ok = mail_service.send_mail(db, email, subject, body)
        _log_send(db, "email", event, ok, email)


def _send_sms(db: Session, event: str, title: str, message: str) -> None:
    from services import sms as sms_service

    text = f"{title}: {message}"
    for phone in _admin_contacts(db)[1]:
        ok = sms_service.send_sms(db, phone, text)
        _log_send(db, "sms", event, ok, phone)


def _send_telegram(db: Session, event: str, title: str, message: str) -> None:
    from services import telegram as telegram_service

    ok = telegram_service.send_telegram(db, f"{title}\n{message}")
    _log_send(db, "telegram", event, ok, "")
