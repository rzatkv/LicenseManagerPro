"""System settings routes (all require a JWT). Mounted at /api/settings.

v3.0: settings are FIXED and predefined. There is no way to create an
arbitrary setting (PUT rejects unknown keys with 404) and no way to
delete one (the DELETE endpoint was removed entirely). System-managed
keys (app_version, latest_version, last_updated, license_security,
captcha_config) are rejected with 400 — they are written by the system
itself, never by a user. Values are validated (panel_domain must be a
hostname, daily_request_limit a number, maintenance_mode on/off).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    CaptchaAdminConfigRequest,
    CaptchaPublicConfigResponse,
    LicenseSecurityConfig,
    LicenseSecurityUpdateRequest,
    SystemSettingRequest,
    SystemSettingResponse,
)
from services import captcha as captcha_service
from services import license_security as security_service
from services import mail as mail_service
from services import notify_channels as notify_channels_service
from services import sms as sms_service
from services import telegram as telegram_service
from services.audit import log_audit
from services.settings import (
    EDITABLE_VIA_API,
    NEVER_EXPOSE_VIA_API,
    SYSTEM_MANAGED,
    get_all_settings,
    get_setting,
    update_setting,
    validate_setting_value,
)
from utils.auth import get_current_user, require_admin
from utils.permissions import require_permission, user_has_permission

router = APIRouter()

# A setting whose key looks like a secret must never be readable by a
# user who cannot write settings (viewers/support): an admin may store
# a credential via the generic settings API, and the list endpoint
# would otherwise hand it to every authenticated user. Withheld keys
# are omitted from the list and read as 404 (indistinguishable from
# a missing key).
SENSITIVE_KEY_MARKERS = ("secret", "password", "token", "private", "credential")


def _is_sensitive_key(key: str) -> bool:
    lowered = (key or "").lower()
    return any(marker in lowered for marker in SENSITIVE_KEY_MARKERS)


@router.get("/license-security", response_model=LicenseSecurityConfig)
def get_license_security(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """The global license-security config (v2.3, typed; also stored as
    the `license_security` system setting)."""
    return security_service.get_license_security_config(db)


@router.put("/license-security", response_model=LicenseSecurityConfig)
def update_license_security(
    request: LicenseSecurityUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("settings:write")),
):
    """Update the global license-security config (v2.3, partial: only
    the keys sent change; invalid values are ignored)."""
    cfg = security_service.set_license_security_config(
        db, request.model_dump(exclude_unset=True)
    )
    log_audit(
        db,
        current_user.email,
        "setting.update",
        "setting",
        "license_security",
        {"value": cfg},
    )
    return cfg


@router.get("/captcha-config", response_model=CaptchaPublicConfigResponse)
def get_captcha_config(
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("settings:write")),
):
    """Admin view of the CAPTCHA config (v3.0): everything except the
    secret key, which is never returned — only `secret_configured`."""
    return captcha_service.public_captcha_config(db)


@router.put("/captcha-config", response_model=CaptchaPublicConfigResponse)
def update_captcha_config(
    request: CaptchaAdminConfigRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("settings:write")),
):
    """Update the CAPTCHA config (v3.0). An empty secret keeps the stored
    one; the literal "__CLEAR__" removes it. Invalid type/model/threshold
    values are rejected with 400."""
    try:
        cfg = captcha_service.set_captcha_config(
            db, request.model_dump(exclude_unset=True)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_audit(
        db,
        current_user.email,
        "setting.update",
        "setting",
        "captcha_config",
        {"value": {k: v for k, v in cfg.items()}},
    )
    return cfg


@router.get("/sms-config")
def get_sms_config(
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("settings:write")),
):
    """Admin view of the SMS config (v3.0): active provider + per-
    provider `configured` flags. Credentials are never returned."""
    return sms_service.public_sms_config(db)


@router.put("/sms-config")
def update_sms_config(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("settings:write")),
):
    """Update the SMS config (v3.0). `active_provider` is a single
    field — setting it to B deactivates A by construction, so two
    providers can never be active at once. An empty credential keeps
    the stored one; "__CLEAR__" removes it."""
    try:
        cfg = sms_service.set_sms_config(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_audit(db, current_user.email, "setting.update", "setting", "sms_config",
              {"active_provider": cfg.get("active_provider")})
    return cfg


@router.get("/email-config")
def get_email_config(
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("settings:write")),
):
    """Admin view of the email config (v3.0): SMTP fields, templates and
    signature. The SMTP password is never returned — only
    `password_configured`."""
    return mail_service.public_email_config(db)


@router.put("/email-config")
def update_email_config(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("settings:write")),
):
    """Update the email config (v3.0): SMTP settings, templates and
    signature. `reset_templates: true` restores the default templates
    + signature. Empty password keeps the stored one."""
    try:
        cfg = mail_service.set_email_config(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_audit(db, current_user.email, "setting.update", "setting", "email_config", {})
    return cfg


@router.get("/telegram-config")
def get_telegram_config(
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("settings:write")),
):
    """Admin view of the Telegram config (v3.0): `token_configured` +
    chat IDs. The bot token is never returned."""
    return telegram_service.public_telegram_config(db)


@router.put("/telegram-config")
def update_telegram_config(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("settings:write")),
):
    """Update the Telegram config (v3.0). Empty bot_token keeps the
    stored one; "__CLEAR__" removes it."""
    try:
        cfg = telegram_service.set_telegram_config(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_audit(db, current_user.email, "setting.update", "setting", "telegram_config",
              {"chat_ids": cfg.get("chat_ids")})
    return cfg


@router.post("/telegram-config/test")
def test_telegram_config(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("settings:write")),
):
    """Test-send (v3.0): sends a test message to every configured chat
    via the stored bot token. Returns {"sent": bool} — False when the
    token/chats are missing or Telegram rejects the call. The attempt
    is logged as a notify.telegram_sent/failed entry (event
    "telegram_test") so it appears in the Logs page's Telegram filter
    and in the sending charts."""
    sent = telegram_service.send_telegram(
        db, "Test notification from License Manager Pro — Telegram is connected."
    )
    from services.audit import log_audit

    log_audit(
        db,
        "system",
        f"notify.telegram_{'sent' if sent else 'failed'}",
        "notification",
        None,
        {"event": "telegram_test", "channel": "telegram", "to": ""},
    )
    return {"sent": sent}


@router.get("/notification-channels")
def get_notification_channels(
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("settings:write")),
):
    """The per-event channel matrix (v3.0): for every event, whether
    email / SMS / Telegram is enabled."""
    return notify_channels_service.get_notification_channels(db)


@router.put("/notification-channels")
def update_notification_channels(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Replace the per-event channel matrix (v3.0). Unknown events or
    channels are rejected with 400. Admin-only: a manager can read the
    matrix but cannot change which channels an event uses."""
    try:
        matrix = notify_channels_service.set_notification_channels(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_audit(db, current_user.email, "setting.update", "setting",
              "notification_channels", {})
    return matrix


@router.get("", response_model=dict)
def get_all_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all system settings as a {key: value} object. Secret-looking
    keys are withheld from users without settings:write; the captcha
    config (which holds the reCAPTCHA secret) is never exposed here."""
    settings = get_all_settings(db)
    settings = {k: v for k, v in settings.items() if k not in NEVER_EXPOSE_VIA_API}
    if user_has_permission(current_user, "settings:write"):
        return settings
    return {k: v for k, v in settings.items() if not _is_sensitive_key(k)}


@router.get("/{key}", response_model=SystemSettingResponse)
def get_system_setting(
    key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the value of one setting (secret-looking keys 404 for
    users without settings:write; the captcha config 404s for everyone —
    it has its own endpoint)."""
    if key in NEVER_EXPOSE_VIA_API:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    if _is_sensitive_key(key) and not user_has_permission(current_user, "settings:write"):
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    value = get_setting(db, key)
    return {"key": key, "value": value}


@router.put("/{key}", response_model=dict)
def update_system_setting(
    key: str,
    request: SystemSettingRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("settings:write")),
):
    """Update one PREDEFINED setting. Unknown keys are rejected (404 —
    settings cannot be created) and system-managed keys with 400."""
    if key != request.key:
        raise HTTPException(status_code=400, detail="Key in path and body must match")
    if key in SYSTEM_MANAGED:
        raise HTTPException(
            status_code=400,
            detail=f"Setting '{key}' is managed by the system and cannot be edited",
        )
    if key not in EDITABLE_VIA_API:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    validate_setting_value(key, request.value)
    value = request.value
    if key == "system_encoding":
        # Normalize the whitelist value to lowercase before storage.
        value = str(value).lower()
    update_setting(db, key, value)
    log_audit(
        db,
        current_user.email,
        "setting.update",
        "setting",
        key,
        {"value": value},
    )
    return {"message": f"Setting '{key}' updated successfully"}
