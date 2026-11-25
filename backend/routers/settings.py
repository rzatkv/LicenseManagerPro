"""System settings routes (all require a JWT). Mounted at /api/settings."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import SystemSetting, User
from schemas import (
    LicenseSecurityConfig,
    LicenseSecurityUpdateRequest,
    SystemSettingRequest,
    SystemSettingResponse,
)
from services import license_security as security_service
from services.audit import log_audit
from services.settings import (
    delete_setting,
    get_all_settings,
    get_setting,
    update_setting,
)
from utils.auth import get_current_user
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


@router.get("", response_model=dict)
def get_all_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all system settings as a {key: value} object. Secret-looking
    keys are withheld from users without settings:write."""
    settings = get_all_settings(db)
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
    users without settings:write)."""
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
    """Create or update one setting."""
    if key != request.key:
        raise HTTPException(status_code=400, detail="Key in path and body must match")
    exists = (
        db.query(SystemSetting).filter(SystemSetting.key == key).first() is not None
    )
    update_setting(db, key, request.value)
    log_audit(
        db,
        current_user.email,
        "setting.update" if exists else "setting.create",
        "setting",
        key,
        {"value": request.value},
    )
    return {"message": f"Setting '{key}' updated successfully"}


@router.delete("/{key}", response_model=dict)
def delete_system_setting(
    key: str,
    db: Session = Depends(get_db),
    # Managers may write settings but not delete them (see permissions map).
    current_user=Depends(require_permission("settings:delete")),
):
    """Delete one setting."""
    delete_setting(db, key)
    log_audit(db, current_user.email, "setting.delete", "setting", key)
    return {"message": f"Setting '{key}' deleted successfully"}
