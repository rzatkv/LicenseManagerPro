"""System info / update routes (admin only).

GET /check-updates compares the running version against the
"latest_version" system setting (legacy, settings-based check).
GET /update-check (v2.2) calls the GitHub releases API live.
POST /update (v2.2) stages the latest release tarball into ./updates/;
the actual apply is scripts/update.sh, executed automatically only when
LMP_ALLOW_SELF_UPDATE=1, otherwise by hand.
"""
from datetime import date
import platform

import fastapi
import pydantic
import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from config import APP_VERSION
from database import get_db
from models import User
from schemas import (
    CheckUpdatesResponse,
    MaintenanceStatusResponse,
    StageUpdateResponse,
    SystemInfoResponse,
    UpdateCheckResponse,
)
from services import updates as update_service
from services import webhooks as webhook_service
from services import service_status as service_status_service
from services.audit import log_audit
from services.settings import get_all_settings, get_setting_default, update_setting
from utils.auth import require_admin
from utils.module_auth import require_actor
from utils.permissions import require_admin_or_manager

router = APIRouter()


@router.get("/ready")
def readiness(db: Session = Depends(get_db)):
    """Readiness probe (no auth): 200 when the DB answers, else 503."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "detail": str(exc)},
        )
    return {"status": "ready"}


def _versions(db: Session) -> tuple[str, str]:
    # v3.0: the RUNNING version always comes from code (config.APP_VERSION),
    # never from a user-editable setting; the LATEST version is the one
    # the update check itself discovered and stored (system-managed).
    settings = get_all_settings(db)
    current = APP_VERSION
    latest = settings.get("latest_version", current)
    return current, latest


@router.get("/maintenance", response_model=MaintenanceStatusResponse)
def get_maintenance_status(db: Session = Depends(get_db)):
    """Public maintenance status for the login page (no auth): whether
    maintenance mode is on and the custom message to show."""
    enabled = get_setting_default(db, "maintenance_mode", "off") == "on"
    message = get_setting_default(db, "maintenance_message", "")
    return {"enabled": enabled, "message": message}


@router.get("/info", response_model=SystemInfoResponse)
def get_system_info(
    db: Session = Depends(get_db),
    # v2.3: admin JWT, or a module key (system:read) — the modules' Test
    # connection calls this endpoint.
    _actor=Depends(require_actor(jwt_perm="*", module_scope="system:read")),
):
    settings = get_all_settings(db)
    engine_name, db_version = _database_version(db)
    return {
        "version": APP_VERSION,
        "lastUpdated": settings.get("last_updated", date.today().isoformat()),
        "panel_domain": settings.get("panel_domain", ""),
        # v3.0.2: full stack, all live runtime values — never hardcoded.
        # Library versions come from the imported packages themselves.
        "python_version": platform.python_version(),
        "fastapi_version": getattr(fastapi, "__version__", "unknown"),
        "sqlalchemy_version": getattr(sqlalchemy, "__version__", "unknown"),
        "pydantic_version": getattr(pydantic, "VERSION", "unknown"),
        "database_engine": engine_name,
        "database_version": db_version,
        "os": f"{platform.system()} {platform.release()} {platform.machine()}".strip(),
    }


def _database_version(db: Session) -> tuple[str, str]:
    """(engine name, server version) live from the session.

    MySQL answers SELECT VERSION(); the test suite runs on SQLite,
    which answers SELECT sqlite_version(). Any failure degrades to
    "unknown" — version detection must never break /system/info.
    No secrets are involved: engine name + version string only.
    """
    try:
        engine_name = db.bind.dialect.name if db.bind is not None else "unknown"
    except Exception:
        engine_name = "unknown"
    try:
        if engine_name == "sqlite":
            version = db.execute(text("SELECT sqlite_version()")).scalar()
        else:
            version = db.execute(text("SELECT VERSION()")).scalar()
        return engine_name, str(version) if version else "unknown"
    except Exception:
        return engine_name, "unknown"


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


@router.get("/sending-stats")
def sending_stats(
    days: int = Query(default=14, ge=1, le=90),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Sending activity (v3.0, admin-only): per-day, per-channel
    sent/failed counts aggregated from the per-channel log stream
    (audit rows `notify.<channel>_sent|failed` and
    `twofa.<channel>_sent|failed`). Powers the dashboard Sending
    charts. Response: {"days", "dates", "series": {channel: [{date,
    sent, failed}, ...], "total": [...]}}."""
    from datetime import datetime, timedelta

    from models import AuditLog

    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(AuditLog)
        .filter(
            AuditLog.created_at >= cutoff,
            (AuditLog.action.like("notify.%", escape="\\"))
            | (AuditLog.action.like("twofa.%", escape="\\")),
        )
        .all()
    )
    dates = [
        (datetime.utcnow().date() - timedelta(days=days - 1 - i)).isoformat()
        for i in range(days)
    ]
    channels = ("email", "sms", "telegram")
    series: dict[str, list[dict]] = {
        ch: [{"date": d, "sent": 0, "failed": 0} for d in dates] for ch in channels
    }
    series["total"] = [{"date": d, "sent": 0, "failed": 0} for d in dates]
    index = {d: i for i, d in enumerate(dates)}
    for row in rows:
        parts = row.action.split(".")
        if len(parts) != 2:
            continue
        channel, outcome = parts[0], parts[1]
        if channel == "notify":
            # notify.<channel>_<outcome>
            sub = outcome.rsplit("_", 1)
            if len(sub) != 2 or sub[0] not in channels or sub[1] not in ("sent", "failed"):
                continue
            channel, outcome = sub
        elif channel == "twofa":
            sub = outcome.rsplit("_", 1)
            if len(sub) != 2 or sub[0] not in channels or sub[1] not in ("sent", "failed"):
                continue
            channel, outcome = sub
        else:
            continue
        day = row.created_at.date().isoformat()
        if day not in index:
            continue
        i = index[day]
        series[channel][i][outcome] += 1
        series["total"][i][outcome] += 1
    return {"days": days, "dates": dates, "series": series}


@router.get("/service-status")
def service_status(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Service status for the dashboard widget (v3.0, admin-only): the
    connection state of database, email (SMTP), the active SMS
    provider, the Telegram bot, and GitHub (update-check upstream).
    Every check has a 5s timeout and they run concurrently, so this
    answers in ~5s worst case. No secrets in the response."""
    return service_status_service.check_all_services(db)


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
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    update_setting(db, "latest_version", result["version"])
    log_audit(db, _admin.email, "system.update_staged", "system", result["version"])
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
