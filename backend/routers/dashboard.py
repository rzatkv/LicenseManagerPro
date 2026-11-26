"""Dashboard routes (admin only)."""
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db, utcnow
from models import ApiKey, License, LicenseActivation, User, WebhookDelivery
from schemas import (
    DashboardSummaryResponse,
    DashboardTrendResponse,
    WebhookStatsResponse,
)
from utils.permissions import require_permission

router = APIRouter()


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_summary(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission("dashboard:read")),
):
    """Aggregate counts for the admin dashboard."""
    licenses = db.query(License).all()
    active = sum(1 for lic in licenses if lic.effective_status == "active")
    return {
        "apiKeysCount": db.query(ApiKey).count(),
        "usersCount": db.query(User).count(),
        "activeLicenses": active,
        "inactiveLicenses": len(licenses) - active,
    }


@router.get("/license-trend", response_model=DashboardTrendResponse)
def get_license_trend(
    days: int = Query(default=14, ge=1, le=90),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission("dashboard:read")),
):
    """Licenses created per day for the last `days` days (v2.2 area chart)."""
    now = utcnow()
    start = (now - timedelta(days=days - 1)).date()
    start_dt = datetime.combine(start, time.min)
    counts: dict[str, int] = {}
    for i in range(days):
        day = start + timedelta(days=i)
        counts[day.isoformat()] = 0
    for lic in (
        db.query(License)
        .filter(License.created_at >= start_dt)
        .all()
    ):
        key = lic.created_at.date().isoformat() if lic.created_at else None
        if key in counts:
            counts[key] += 1
    return {
        "days": days,
        "points": [{"date": d, "count": counts[d]} for d in sorted(counts)],
    }


@router.get("/activations-trend", response_model=DashboardTrendResponse)
def get_activations_trend(
    days: int = Query(default=14, ge=1, le=90),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission("dashboard:read")),
):
    """Activation instances created per day for the last `days` days (v2.3)."""
    now = utcnow()
    start = (now - timedelta(days=days - 1)).date()
    start_dt = datetime.combine(start, time.min)
    counts: dict[str, int] = {}
    for i in range(days):
        day = start + timedelta(days=i)
        counts[day.isoformat()] = 0
    for act in (
        db.query(LicenseActivation)
        .filter(LicenseActivation.created_at >= start_dt)
        .all()
    ):
        key = act.created_at.date().isoformat() if act.created_at else None
        if key in counts:
            counts[key] += 1
    return {
        "days": days,
        "points": [{"date": d, "count": counts[d]} for d in sorted(counts)],
    }


@router.get("/webhook-stats", response_model=WebhookStatsResponse)
def get_webhook_stats(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission("dashboard:read")),
):
    """Webhook delivery success rate overall + per event (v2.3)."""
    deliveries = db.query(WebhookDelivery).all()
    total = len(deliveries)
    success = sum(1 for d in deliveries if d.success)
    by_event: dict[str, dict] = {}
    for d in deliveries:
        entry = by_event.setdefault(d.event, {"total": 0, "success": 0})
        entry["total"] += 1
        if d.success:
            entry["success"] += 1
    return {
        "total": total,
        "success": success,
        "failed": total - success,
        "success_rate": round(100.0 * success / total, 1) if total else 100.0,
        "by_event": by_event,
    }
