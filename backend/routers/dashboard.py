"""Dashboard routes (admin only)."""
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db, utcnow
from models import ApiKey, License, Product, User
from schemas import DashboardSummaryResponse, DashboardTrendResponse
from services.products import CYCLE_MONTHS
from utils.auth import require_admin

router = APIRouter()


def _monthly_value(price: float | None, billing_cycle: str | None) -> float:
    """One license's price normalised to a monthly amount (v2.2 MRR)."""
    if not price:
        return 0.0
    if billing_cycle == "lifetime":
        return 0.0
    months = CYCLE_MONTHS.get(billing_cycle or "", 0)
    if not months:
        return 0.0
    return round(price / months, 2)


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_summary(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Aggregate counts for the admin dashboard (v2.2: + estimated MRR)."""
    licenses = db.query(License).all()
    products = {p.id: p for p in db.query(Product).all()}
    active = 0
    estimated_mrr = 0.0
    for lic in licenses:
        if lic.effective_status != "active":
            continue
        active += 1
        product = products.get(lic.product_id) if lic.product_id else None
        if product is not None:
            estimated_mrr += _monthly_value(product.price, lic.billing_cycle)
    return {
        "apiKeysCount": db.query(ApiKey).count(),
        "usersCount": db.query(User).count(),
        "activeLicenses": active,
        "inactiveLicenses": len(licenses) - active,
        "estimated_mrr": round(estimated_mrr, 2),
    }


@router.get("/license-trend", response_model=DashboardTrendResponse)
def get_license_trend(
    days: int = Query(default=14, ge=1, le=90),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
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
