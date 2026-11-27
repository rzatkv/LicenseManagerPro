"""One shared notification-template renderer (v3.0.8).

Email, SMS and Telegram templates all render through here, so the
three channels understand exactly the same placeholders:

    %name%   — WHMCS-style (what the admin writes, e.g. %client%)
    {name}   — the SMS/Telegram style since v3.0.7
    {{name}} — the email-template style since v3.0

A single regex pass substitutes all three forms; the ``{{name}}``
alternative comes first so the double braces are never half-eaten.
Unknown placeholders stay literal (and are logged); any render
failure falls back to the caller's fallback text — a send never
crashes the triggering action.

Variables (canonical name — ``%`` aliases — sample value shown in
the Settings UI guide):
    title        — the notification title
    message      — the notification message
    client       — the customer's name. Source, in order:
                   1. an explicit ``client_name`` in the context
                   2. the local-part of ``user_email`` (before the @)
                   3. the fallback «مشتری گرامی»
                  The system stores no customer name (a License has
                  only ``owner_email``), so the local-part is the
                  honest derivation; it is never rendered empty.
    license      — license_key, the license code
    product      — product_name
    expiry       — expiry_date
    days         — days_left
    email        — user_email
    role         — the user's role
    site_name    — the panel's site name
    code         — the 2FA code (email twofa_code template only)

``client`` is always available (it derives with a fallback, like
title/message), so it is NOT part of the per-event variable lists —
every event's templates may use it.
"""
import logging
import re

logger = logging.getLogger(__name__)

# %alias% -> canonical context key. The canonical names themselves
# are valid placeholders too ({license_key}, %product_name%, ...).
VARIABLE_ALIASES = {
    "client": "client_name",
    "license": "license_key",
    "product": "product_name",
    "expiry": "expiry_date",
    "days": "days_left",
    "email": "user_email",
}

CLIENT_FALLBACK = "مشتری گرامی"

# The variable guide, in display order: (placeholder, sample value).
# The Settings UI shows exactly this table, and the live preview
# renders templates with exactly these values — so the admin sees the
# final message. Keep the frontend mirrors (demoData.js
# NOTIFY_VAR_SAMPLES, Settings.js TEMPLATE_SAMPLES) in sync; the
# contract test pins them.
VARIABLE_GUIDE = [
    ("title", "License created"),
    ("message", "License LIC-DEMO-1234-5678 for CloudPanel Pro was created."),
    ("client", "علی رضایی"),
    ("license", "XXXX-XXXX-XXXX-XXXX"),
    ("product", "محصول نمونه"),
    ("expiry", "۱۴۰۵/۰۹/۰۶"),
    ("days", "۷"),
    ("email", "client@example.com"),
    ("role", "مدیر"),
    ("site_name", "License Manager Pro"),
    ("code", "482917"),
]

# Sample values keyed by canonical context key (what the preview
# renders with). Alias placeholders share their canonical sample.
SAMPLE_VALUES = {
    "title": "License created",
    "message": "License LIC-DEMO-1234-5678 for CloudPanel Pro was created.",
    "client_name": "علی رضایی",
    "license_key": "XXXX-XXXX-XXXX-XXXX",
    "product_name": "محصول نمونه",
    "expiry_date": "۱۴۰۵/۰۹/۰۶",
    "days_left": "۷",
    "user_email": "client@example.com",
    "role": "مدیر",
    "site_name": "License Manager Pro",
    "code": "482917",
}

_TEMPLATE_RE = re.compile(
    r"%([A-Za-z0-9_]+)%|\{\{\s*([A-Za-z0-9_]+)\s*\}\}|\{([A-Za-z0-9_]+)\}"
)


def resolve_client_name(context: dict | None) -> str:
    """The %client% value: explicit client_name, else the user_email
    local-part, else the «مشتری گرامی» fallback — never empty."""
    ctx = context or {}
    name = ctx.get("client_name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    email = ctx.get("user_email")
    if isinstance(email, str) and "@" in email:
        local = email.split("@", 1)[0].strip()
        if local:
            return local
    return CLIENT_FALLBACK


def build_variable_map(context: dict | None) -> dict:
    """The full substitution map for a render: the caller's context
    plus the derived ``client_name`` and every ``%`` alias, which
    always resolves to its canonical value."""
    full = dict(context or {})
    full["client_name"] = resolve_client_name(context)
    for alias, canonical in VARIABLE_ALIASES.items():
        # The alias always resolves to its canonical value — an
        # explicitly passed alias never overrides the real value.
        if canonical in full:
            full[alias] = full[canonical]
    return full


def sample_context() -> dict:
    """The canonical context the UI preview renders with."""
    return dict(SAMPLE_VALUES)


def render_template_text(template: str, context: dict | None = None, fallback: str = "") -> str:
    """Render one template in any of the three syntaxes. Unknown
    placeholders stay literal and are logged; any failure returns
    ``fallback`` instead of raising."""
    try:
        full = build_variable_map(context)

        def _sub(match):
            name = match.group(1) or match.group(2) or match.group(3)
            if name in full:
                return str(full[name])
            logger.warning(
                "unknown placeholder %s in notification template", match.group(0)
            )
            return match.group(0)

        return _TEMPLATE_RE.sub(_sub, template)
    except Exception:
        logger.exception("notification template render failed, using fallback")
        return fallback
