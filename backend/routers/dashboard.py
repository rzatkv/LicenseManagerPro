"""Dashboard routes (admin only)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import ApiKey, License, User
from schemas import DashboardSummaryResponse
from utils.auth import require_admin

router = APIRouter()


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_summary(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
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
