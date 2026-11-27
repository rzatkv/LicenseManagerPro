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
from services.template_render import render_template_text

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

# Editable SMS/Telegram texts (v3.0.7): per event × channel, stored as
# one JSON setting, `notification_texts`:
#
#     {"license_created": {"sms": "{title}: {message}",
#                          "telegram": "{title}\n{message}"}, ...}
#
# Defaults reproduce the pre-v3.0.7 hardcoded output byte-for-byte
# (SMS "{title}: {message}", Telegram "{title}\n{message}").
# Placeholders (v3.0.8, shared renderer in services/template_render):
# %var% (WHMCS-style), {var} and {{var}} all work in every channel.
# {title} and {message} always, plus the event's context variables
# (see NOTIFY_TEXT_VARIABLES), plus %client% — always available, it
# derives from the license owner's name / user_email local-part with
# a «مشتری گرامی» fallback, so it is not part of the per-event lists.
# Unknown placeholders are left literal (never a crash) and logged;
# a failed render never breaks the triggering action — the default
# format is used instead.
TEXT_CHANNELS = ("sms", "telegram")
MAX_TEXT_LENGTH = 2000

DEFAULT_TEXTS = {
    event: {"sms": "{title}: {message}", "telegram": "{title}\n{message}"}
    for event in EVENTS
}

# Context variables each event provides to its templates (mirrors the
# `context=` argument at every notify_event() call site). The Settings
# UI shows exactly these per event, plus {title} and {message}.
NOTIFY_TEXT_VARIABLES = {
    "license_created": ["license_key", "product_name", "expiry_date", "user_email"],
    "license_reissued": ["license_key", "product_name", "expiry_date", "user_email"],
    "license_expiring": ["license_key", "product_name", "expiry_date", "days_left", "user_email"],
    "license_expired": ["license_key", "product_name", "expiry_date", "user_email"],
    "webhook_failed": [],
    "webhook_blocked": [],
    "user_created": ["user_email", "role"],
    "api_key_expiring": [],
}

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


def get_notification_texts(db: Session) -> dict:
    """Stored texts merged over the defaults (unknown events/channels
    are ignored; non-string values keep the default)."""
    try:
        stored = json.loads(get_setting_default(db, "notification_texts", "{}") or "{}")
    except (ValueError, TypeError):
        stored = {}
    merged = {event: dict(DEFAULT_TEXTS[event]) for event in EVENTS}
    for event, texts in (stored or {}).items():
        if event in merged and isinstance(texts, dict):
            for channel in TEXT_CHANNELS:
                if isinstance(texts.get(channel), str):
                    merged[event][channel] = texts[channel]
    return merged


def set_notification_texts(db: Session, matrix: dict) -> dict:
    """Replace the stored texts (validated: known events, sms/telegram
    channels only, string values with a length cap). Returns the merged
    matrix (stored over defaults)."""
    from services.settings import update_setting

    if not isinstance(matrix, dict):
        raise ValueError("notification texts must be an object")
    cleaned = {}
    for event, texts in matrix.items():
        if event not in EVENTS:
            raise ValueError(f"Unknown notification event: {event!r}")
        if not isinstance(texts, dict):
            raise ValueError(f"Texts for {event!r} must be an object")
        cleaned[event] = {}
        for channel, text in texts.items():
            if channel not in TEXT_CHANNELS:
                raise ValueError(f"Unknown channel: {channel!r}")
            if not isinstance(text, str):
                raise ValueError(f"Text for {event!r}/{channel!r} must be a string")
            if len(text) > MAX_TEXT_LENGTH:
                raise ValueError(
                    f"Text for {event!r}/{channel!r} exceeds {MAX_TEXT_LENGTH} characters"
                )
            cleaned[event][channel] = text
    update_setting(db, "notification_texts", json.dumps(cleaned))
    return get_notification_texts(db)


# ---- IPPanel pattern codes (v3.0.7) --------------------------------------
# Per-event pattern code, ippanel only, stored as one JSON setting,
# `sms_ippanel_patterns`: {"license_created": "abc123", ...}. Empty (or
# absent) means "no pattern for that event" — the editable SMS text goes
# out via send_webservice instead. When ippanel is the active provider
# AND a code is set for the event, the SMS goes out via send_pattern
# (one call per admin phone — the Edge pattern send allows exactly one
# recipient per call), with `params` built from the same template
# variables the editable texts receive.
MAX_PATTERN_CODE_LENGTH = 200

# The only variables a pattern's params may carry (the same context
# vars the editable SMS/Telegram texts receive, plus title/message).
PATTERN_PARAM_KEYS = (
    "title",
    "message",
    "license_key",
    "product_name",
    "expiry_date",
    "days_left",
    "user_email",
    "role",
)


def get_ippanel_patterns(db: Session) -> dict:
    """Stored pattern codes merged over the defaults (all empty;
    unknown events ignored; non-string values keep the default)."""
    try:
        stored = json.loads(get_setting_default(db, "sms_ippanel_patterns", "{}") or "{}")
    except (ValueError, TypeError):
        stored = {}
    merged = {event: "" for event in EVENTS}
    for event, code in (stored or {}).items():
        if event in merged and isinstance(code, str):
            merged[event] = code
    return merged


def set_ippanel_patterns(db: Session, mapping: dict) -> dict:
    """Replace the stored pattern codes (validated: known events only,
    string values, length cap; empty clears a code). Returns the merged
    mapping (stored over defaults)."""
    from services.settings import update_setting

    if not isinstance(mapping, dict):
        raise ValueError("ippanel patterns must be an object")
    cleaned = {}
    for event, code in mapping.items():
        if event not in EVENTS:
            raise ValueError(f"Unknown notification event: {event!r}")
        if not isinstance(code, str):
            raise ValueError(f"Pattern code for {event!r} must be a string")
        if len(code) > MAX_PATTERN_CODE_LENGTH:
            raise ValueError(
                f"Pattern code for {event!r} exceeds {MAX_PATTERN_CODE_LENGTH} characters"
            )
        cleaned[event] = code.strip()
    update_setting(db, "sms_ippanel_patterns", json.dumps(cleaned))
    return get_ippanel_patterns(db)


def build_pattern_params(title: str, message: str, ctx: dict) -> dict:
    """Build the `params` object for a pattern send: title/message plus
    the event's context variables, stringified; missing (or empty)
    values are omitted — a pattern's placeholders must only receive
    values that exist."""
    full = {**(ctx or {}), "title": title, "message": message}
    params = {}
    for key in PATTERN_PARAM_KEYS:
        value = full.get(key)
        if value is None:
            continue
        text = str(value)
        if text == "":
            continue
        params[key] = text
    return params


# Sample values for the SMS test-send (the same values the Settings UI
# preview uses): a pattern test must exercise the real params the
# event would send, not invented ones.
SAMPLE_PATTERN_TITLE = "License created"
SAMPLE_PATTERN_MESSAGE = "License LIC-DEMO-1234-5678 for CloudPanel Pro was created."
SAMPLE_PATTERN_CONTEXT = {
    "license_created": {
        "license_key": "LIC-DEMO-1234-5678",
        "product_name": "CloudPanel Pro",
        "expiry_date": "2026-12-31",
        "user_email": "customer@example.com",
    },
    "license_reissued": {
        "license_key": "LIC-DEMO-1234-5678",
        "product_name": "CloudPanel Pro",
        "expiry_date": "2026-12-31",
        "user_email": "customer@example.com",
    },
    "license_expiring": {
        "license_key": "LIC-DEMO-1234-5678",
        "product_name": "CloudPanel Pro",
        "expiry_date": "2026-12-31",
        "days_left": "7",
        "user_email": "customer@example.com",
    },
    "license_expired": {
        "license_key": "LIC-DEMO-1234-5678",
        "product_name": "CloudPanel Pro",
        "expiry_date": "2026-12-31",
        "user_email": "customer@example.com",
    },
    "webhook_failed": {},
    "webhook_blocked": {},
    "user_created": {"user_email": "new@example.com", "role": "support"},
    "api_key_expiring": {},
}


def sample_pattern_params(event: str) -> dict:
    """The params a pattern test-send for `event` carries."""
    return build_pattern_params(
        SAMPLE_PATTERN_TITLE,
        SAMPLE_PATTERN_MESSAGE,
        SAMPLE_PATTERN_CONTEXT.get(event) or {},
    )


def render_notification_text(
    template: str, title: str, message: str, context: dict, fallback: str
) -> str:
    """Render an SMS/Telegram template through the shared renderer
    (v3.0.8): %var%, {var} and {{var}} all work; {title} and {message}
    are always available; context variables (license_key, product_name,
    expiry_date, days_left, user_email, role, site_name) substitute
    when provided; %client% always resolves (see template_render).
    Unknown placeholders are left literal and logged; any render
    failure falls back to `fallback` — a send never crashes the
    triggering action."""
    # title/message always win: a context key must never override them.
    return render_template_text(
        template, {**(context or {}), "title": title, "message": message}, fallback
    )


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
        _send_sms(db, event, title, message, ctx)
    if channels["telegram"]:
        _send_telegram(db, event, title, message, ctx)


def _log_send(db: Session, channel: str, event: str, ok: bool, to: str, extra: dict | None = None) -> None:
    """Per-channel log (v3.0): every outbound send is recorded in the
    audit trail as `notify.<channel>_sent|failed` with the channel in
    the details, so the Logs page can filter one channel's stream.
    Actor is "system" — these are machine sends, not admin actions.
    `extra` (e.g. mode/pattern_code) is merged into the details."""
    details = {"event": event, "channel": channel, "to": to}
    if extra:
        details.update(extra)
    log_audit(
        db,
        "system",
        f"notify.{channel}_{'sent' if ok else 'failed'}",
        "notification",
        None,
        details,
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


def _send_sms(db: Session, event: str, title: str, message: str, ctx: dict) -> None:
    from services import sms as sms_service

    # v3.0.7: ippanel pattern path — when ippanel is the active
    # provider AND a pattern code is set for this event, the SMS goes
    # out via send_pattern (one call per admin phone, which is exactly
    # the Edge pattern rule); otherwise the editable SMS text goes out
    # via send_webservice as before. A pattern failure is logged and
    # never breaks the triggering action (send_pattern_sms returns
    # False instead of raising).
    code = get_ippanel_patterns(db).get(event, "")
    if code and sms_service.active_provider(db) == "ippanel":
        params = build_pattern_params(title, message, ctx)
        for phone in _admin_contacts(db)[1]:
            ok = sms_service.send_pattern_sms(db, phone, code, params)
            _log_send(db, "sms", event, ok, phone, {"mode": "pattern", "pattern_code": code})
        return

    site = get_setting_default(db, "site_name", "License Manager Pro")
    template = get_notification_texts(db)[event]["sms"]
    text = render_notification_text(
        template, title, message, {"site_name": site, **ctx}, f"{title}: {message}"
    )
    for phone in _admin_contacts(db)[1]:
        ok = sms_service.send_sms(db, phone, text)
        _log_send(db, "sms", event, ok, phone, {"mode": "webservice"})


def _send_telegram(db: Session, event: str, title: str, message: str, ctx: dict) -> None:
    from services import telegram as telegram_service

    site = get_setting_default(db, "site_name", "License Manager Pro")
    template = get_notification_texts(db)[event]["telegram"]
    text = render_notification_text(
        template, title, message, {"site_name": site, **ctx}, f"{title}\n{message}"
    )
    ok = telegram_service.send_telegram(db, text)
    _log_send(db, "telegram", event, ok, "")
