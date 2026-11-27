"""Email templates + signature (v3.0).

The admin edits templates in Settings → Email. Each template has a
subject and a body with placeholders; the mail service renders the
stored template with the real values and appends the stored signature
to every outgoing email. Rendering goes through the shared renderer
(services/template_render, v3.0.8), so %var% (WHMCS-style), {var} and
{{var}} all work in email too — the old {{var}} templates keep
working unchanged. Unknown placeholders are left untouched (never a
crash). A template/body with no placeholders is fine. Rendering is
pure string substitution — no eval, no Jinja. %client% always
resolves (license owner's name, else the user_email local-part, else
«مشتری گرامی») — never empty.

Templates (variables documented next to each one in the Settings UI):
- twofa_code:       {{code}}, {{site_name}}, {{user_email}}
- license_created:  {{license_key}}, {{product_name}}, {{expiry_date}},
                    {{site_name}}, {{user_email}}, {{client_name}}
- license_renewed:  {{license_key}}, {{product_name}}, {{expiry_date}},
                    {{site_name}}, {{user_email}}, {{client_name}}
- license_expiring: {{license_key}}, {{product_name}}, {{expiry_date}},
                    {{days_left}}, {{site_name}}, {{user_email}},
                    {{client_name}}
- license_expired:  {{license_key}}, {{product_name}}, {{expiry_date}},
                    {{site_name}}, {{user_email}}, {{client_name}}
- user_created:     {{user_email}}, {{role}}, {{site_name}},
                    {{client_name}}
"""
import json

from sqlalchemy.orm import Session

from services.settings import get_setting_default
from services.template_render import render_template_text

DEFAULT_SIGNATURE = "--\nLicense Manager Pro"

DEFAULT_TEMPLATES = {
    "twofa_code": {
        "subject": "Your verification code",
        "body": (
            "Hello,\n\n"
            "Your verification code is: {{code}}\n\n"
            "This code expires in 5 minutes. If you did not request it, "
            "ignore this email.\n"
        ),
    },
    "license_created": {
        "subject": "Your license for {{product_name}} is ready",
        "body": (
            "Hello,\n\n"
            "Your license has been created.\n\n"
            "License key: {{license_key}}\n"
            "Product: {{product_name}}\n"
            "Expires: {{expiry_date}}\n"
        ),
    },
    "license_renewed": {
        "subject": "Your license for {{product_name}} was renewed",
        "body": (
            "Hello,\n\n"
            "Your license has been renewed.\n\n"
            "License key: {{license_key}}\n"
            "Product: {{product_name}}\n"
            "Expires: {{expiry_date}}\n"
        ),
    },
    "license_expiring": {
        "subject": "Your license for {{product_name}} expires soon",
        "body": (
            "Hello,\n\n"
            "Your license expires in {{days_left}} day(s).\n\n"
            "License key: {{license_key}}\n"
            "Product: {{product_name}}\n"
            "Expires: {{expiry_date}}\n\n"
            "Please renew it before it expires.\n"
        ),
    },
    "license_expired": {
        "subject": "Your license for {{product_name}} has expired",
        "body": (
            "Hello,\n\n"
            "Your license has expired.\n\n"
            "License key: {{license_key}}\n"
            "Product: {{product_name}}\n"
            "Expired: {{expiry_date}}\n"
        ),
    },
    "user_created": {
        "subject": "Your account on {{site_name}}",
        "body": (
            "Hello,\n\n"
            "An account was created for you on {{site_name}}.\n\n"
            "Email: {{user_email}}\n"
            "Role: {{role}}\n"
        ),
    },
}

# Variables each template accepts (shown in the Settings UI help text).
# client_name is always available (it derives with a fallback — see
# template_render), so it is listed for every template that has a
# person behind it.
TEMPLATE_VARIABLES = {
    "twofa_code": ["code", "site_name", "user_email"],
    "license_created": ["license_key", "product_name", "expiry_date", "site_name", "user_email", "client_name"],
    "license_renewed": ["license_key", "product_name", "expiry_date", "site_name", "user_email", "client_name"],
    "license_expiring": ["license_key", "product_name", "expiry_date", "days_left", "site_name", "user_email", "client_name"],
    "license_expired": ["license_key", "product_name", "expiry_date", "site_name", "user_email", "client_name"],
    "user_created": ["user_email", "role", "site_name", "client_name"],
}


def _email_config(db: Session) -> dict:
    try:
        return json.loads(get_setting_default(db, "email_config", "{}") or "{}")
    except (ValueError, TypeError):
        return {}


def get_templates(db: Session) -> dict:
    """Stored templates merged over the defaults (unknown template names
    are ignored — only the six known templates exist)."""
    stored = _email_config(db).get("templates") or {}
    merged = {name: dict(tpl) for name, tpl in DEFAULT_TEMPLATES.items()}
    for name, tpl in stored.items():
        if name in merged and isinstance(tpl, dict):
            if tpl.get("subject") is not None:
                merged[name]["subject"] = str(tpl["subject"])
            if tpl.get("body") is not None:
                merged[name]["body"] = str(tpl["body"])
    return merged


def get_signature(db: Session) -> str:
    cfg = _email_config(db)
    return cfg.get("signature", DEFAULT_SIGNATURE)


def render_template(db: Session, name: str, context: dict) -> tuple[str, str]:
    """Render a stored template with `context` values and append the
    stored signature to the body. Returns (subject, body). Unknown
    template name falls back to the twofa_code template shape with an
    empty body — callers should only pass known names."""
    templates = get_templates(db)
    tpl = templates.get(name) or DEFAULT_TEMPLATES["twofa_code"]
    site = get_setting_default(db, "site_name", "License Manager Pro")
    full = {"site_name": site, **(context or {})}

    # Shared renderer (v3.0.8): %var%, {var} and {{var}} all work;
    # unknown placeholders stay literal; a failed render falls back
    # to the raw template text instead of raising.
    subject = render_template_text(tpl["subject"], full, tpl["subject"])
    body = render_template_text(tpl["body"], full, tpl["body"])
    signature = get_signature(db)
    if signature:
        body = body.rstrip("\n") + "\n\n" + signature + "\n"
    return subject, body
