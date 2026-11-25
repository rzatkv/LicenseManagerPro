"""System info / update routes (admin only).

GET /check-updates compares the running version against the
"latest_version" system setting (legacy, settings-based check).
GET /update-check (v2.2) calls the GitHub releases API live.
POST /update (v2.2) stages the latest release tarball into ./updates/;
the actual apply is scripts/update.sh, executed automatically only when
LMP_ALLOW_SELF_UPDATE=1, otherwise by hand.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    CheckUpdatesResponse,
    StageUpdateResponse,
    SystemInfoResponse,
    UpdateCheckResponse,
)
from services import updates as update_service
from services import webhooks as webhook_service
from services.settings import get_all_settings, update_setting
from utils.auth import require_admin
from utils.permissions import require_admin_or_manager

router = APIRouter()


@router.get("/ready")
def readiness(db: Session = Depends(get_db)):
    """Readiness probe (no auth): 200 when the DB answers, else 503."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - readiness reports any DB failure
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "detail": str(exc)},
        )
    return {"status": "ready"}


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


@router.get("/update-check", response_model=UpdateCheckResponse)
def update_check(
    db: Session = Depends(get_db),
    _user: User = Depends(require_admin_or_manager),
):
    """Live update check against the GitHub releases API (v2.2)."""
    return update_service.check_update(db)


@router.post("/update", response_model=StageUpdateResponse)
def apply_update(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Stage the latest release tarball for update (v2.2).

    The tarball is downloaded into ./updates/ and verified; nothing live
    is touched. The apply step is scripts/update.sh — run automatically
    only when LMP_ALLOW_SELF_UPDATE=1, otherwise by hand (see next_step).
    """
    try:
        result = update_service.stage_update()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    update_setting(db, "latest_version", result["version"])
    return result


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
