"""System info / update routes (admin only).

The update check compares the running version against the "latest_version"
system setting. POST /update records the pending version as applied. This is
an honest stub: it does not perform a real self-update (git pull / rebuild);
see the README.
"""
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import CheckUpdatesResponse, MessageResponse, SystemInfoResponse
from services import webhooks as webhook_service
from services.settings import get_all_settings, update_setting
from utils.auth import require_admin
from utils.permissions import require_admin_or_manager

router = APIRouter()


def _versions(db: Session) -> tuple[str, str]:
    settings = get_all_settings(db)
    current = settings.get("app_version", "1.0.0")
    latest = settings.get("latest_version", current)
    return current, latest


@router.get("/info", response_model=SystemInfoResponse)
def get_system_info(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    settings = get_all_settings(db)
    return {
        "version": settings.get("app_version", "1.0.0"),
        "lastUpdated": settings.get("last_updated", date.today().isoformat()),
    }


@router.get("/check-updates", response_model=CheckUpdatesResponse)
def check_updates(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    current, latest = _versions(db)
    return {
        "updateAvailable": latest != current,
        "currentVersion": current,
        "latestVersion": latest,
    }


@router.post("/update", response_model=MessageResponse)
def apply_update(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    current, latest = _versions(db)
    if latest == current:
        return {"message": "System is already up to date"}
    update_setting(db, "app_version", latest)
    update_setting(db, "last_updated", date.today().isoformat())
    return {"message": f"System updated to version {latest}"}


@router.post("/check-expiring", response_model=dict)
def check_expiring(
    days: int = Query(default=7, ge=1, le=365),
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin_or_manager),
):
    """Scan for expiring/expired licenses and fire their webhooks.

    Fires license.expiring for active licenses expiring within `days` days
    and license.expired for active licenses whose expiry already passed.
    Only licenses whose product has a webhook_url configured produce a
    delivery (and are counted). Intended to be called daily, e.g. by cron.
    """
    return webhook_service.check_expiring_licenses(db, days=days)
