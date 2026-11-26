"""System settings business logic (unchanged behaviour, SQLAlchemy 2.x).

v3.0: settings are FIXED and predefined — there is no "create a setting"
and no deleting one. Only the keys in EDITABLE_VIA_API may be changed
through the HTTP API (the Settings page); app_version / latest_version /
last_updated are written by the system itself (install seed, update
check, update apply) and license_security has its own typed endpoint.
Arbitrary keys are rejected at the router with 404, system-managed keys
with 400. Internal code still uses update_setting() directly.
"""
import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import SystemSetting

# Keys an admin may change through PUT /api/settings/{key}.
EDITABLE_VIA_API: frozenset[str] = frozenset(
    {
        "site_name",
        "logo_url",
        "daily_request_limit",
        "panel_domain",
        "maintenance_mode",
        "maintenance_message",
        # Date calendar (v3.0): gregorian | jalali | hijri.
        "date_calendar",
        # Auto-strip 4-byte characters (v3.0): on | off (default on).
        "strip_4byte",
        # 2FA delivery channel (v3.0): totp | email | sms.
        "twofa_channel",
        # System encoding (v3.0): utf-8 | windows-1256 | iso-8859-1.
        "system_encoding",
        # Product & license notes (v3.0): on | off (default on).
        "product_notes_enabled",
    }
)

# Keys that exist in the DB but are written by the system, never by a user.
SYSTEM_MANAGED: frozenset[str] = frozenset(
    {
        "app_version",
        "latest_version",
        "last_updated",
        "license_security",
        "captcha_config",
        # JSON configs with their own typed endpoints (v3.0).
        "sms_config",
        "email_config",
        "telegram_config",
        "notification_channels",
    }
)

# Keys that must never be returned by the generic settings API at all
# (their contents include a secret; they have a dedicated endpoint).
NEVER_EXPOSE_VIA_API: frozenset[str] = frozenset(
    {"captcha_config", "sms_config", "email_config", "telegram_config"}
)

_HOSTNAME_LABEL = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
_HOSTNAME_RE = re.compile(rf"^{_HOSTNAME_LABEL}(?:\.{_HOSTNAME_LABEL})*$")


def is_valid_hostname(value: str) -> bool:
    """A bare hostname/domain: labels of alphanumerics/hyphens, no scheme,
    port, path or underscores; total length <= 253. Single-label names
    (e.g. "localhost") are accepted for local installs."""
    if not isinstance(value, str) or not value or len(value) > 253:
        return False
    if "://" in value or "/" in value or ":" in value or "_" in value:
        return False
    return _HOSTNAME_RE.match(value) is not None


def validate_setting_value(key: str, value: str) -> None:
    """Raise HTTPException(400) when a user-supplied value is invalid."""
    if key == "panel_domain":
        # Empty clears the domain (falls back to the request host).
        if value and not is_valid_hostname(value):
            raise HTTPException(
                status_code=400,
                detail="panel_domain must be a valid hostname, e.g. panel.example.com",
            )
    elif key == "daily_request_limit":
        try:
            n = int(str(value))
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400, detail="daily_request_limit must be a whole number"
            ) from None
        if n < 1 or n > 1_000_000:
            raise HTTPException(
                status_code=400,
                detail="daily_request_limit must be between 1 and 1000000",
            )
    elif key == "maintenance_mode":
        if value not in ("on", "off"):
            raise HTTPException(
                status_code=400, detail="maintenance_mode must be 'on' or 'off'"
            )
    elif key == "maintenance_message":
        if len(str(value)) > 500:
            raise HTTPException(
                status_code=400, detail="maintenance_message must be at most 500 characters"
            )
    elif key == "site_name":
        if not str(value).strip() or len(str(value)) > 100:
            raise HTTPException(
                status_code=400, detail="site_name must be 1-100 characters"
            )
    elif key == "logo_url":
        if len(str(value)) > 500:
            raise HTTPException(
                status_code=400, detail="logo_url must be at most 500 characters"
            )
    elif key == "date_calendar":
        if value not in ("gregorian", "jalali", "hijri"):
            raise HTTPException(
                status_code=400,
                detail="date_calendar must be gregorian, jalali or hijri",
            )
    elif key in ("strip_4byte", "product_notes_enabled"):
        if value not in ("on", "off"):
            raise HTTPException(
                status_code=400, detail=f"{key} must be 'on' or 'off'"
            )
    elif key == "twofa_channel":
        if value not in ("totp", "email", "sms"):
            raise HTTPException(
                status_code=400,
                detail="twofa_channel must be totp, email or sms",
            )
    elif key == "system_encoding":
        # Whitelist only; anything else is rejected. The value is
        # normalized to lowercase before storage (the router passes
        # the raw value through here — normalize in place).
        if str(value).lower() not in ("utf-8", "windows-1256", "iso-8859-1"):
            raise HTTPException(
                status_code=400,
                detail="system_encoding must be utf-8, windows-1256 or iso-8859-1",
            )


def get_setting(db: Session, key: str) -> str:
    """Return the value of one setting, or 404 when it does not exist."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return setting.value


def get_setting_default(db: Session, key: str, default: str) -> str:
    """Return the value of one setting, or `default` when it is missing."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return setting.value if setting else default


def notes_enabled(db: Session) -> bool:
    """Whether the product/license notes feature is enabled (v3.0)."""
    return get_setting_default(db, "product_notes_enabled", "on") == "on"


def require_notes_enabled(db: Session, notes) -> None:
    """Reject notes input while the notes feature is disabled (v3.0):
    the backend does not accept/store new notes when the setting is off."""
    if notes not in (None, "") and not notes_enabled(db):
        raise HTTPException(
            status_code=400,
            detail="Product & license notes are disabled in Settings → General",
        )


def update_setting(db: Session, key: str, value: str):
    """Create or update a setting (internal use; the HTTP API allowlists
    keys and validates values before calling this)."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = SystemSetting(key=key, value=value)
        db.add(setting)
    db.commit()
    return {"message": f"Setting '{key}' updated successfully"}


def get_all_settings(db: Session) -> dict:
    """Return all settings as a {key: value} dict."""
    settings = db.query(SystemSetting).all()
    return {setting.key: setting.value for setting in settings}
