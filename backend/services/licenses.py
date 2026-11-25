"""License business logic."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database import utcnow
from models import License
from schemas import LicenseCreateRequest, LicenseUpdateRequest

LICENSE_STATUSES = ["active", "inactive", "revoked"]


def generate_license_key() -> str:
    """Generate a random license key in XXXX-XXXX-XXXX-XXXX form."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(16))
    return "-".join(raw[i : i + 4] for i in range(0, 16, 4))


def serialize_license(license_: License) -> dict:
    """License as a plain dict, with the derived (effective) status."""
    return {
        "id": license_.id,
        "key": license_.key,
        "product": license_.product,
        "owner_email": license_.owner_email,
        "status": license_.effective_status,
        "expires_at": license_.expires_at,
        "max_activations": license_.max_activations,
        "activations": license_.activations,
        "created_at": license_.created_at,
        "updated_at": license_.updated_at,
    }


def create_license(request: LicenseCreateRequest, db: Session) -> License:
    if request.status not in LICENSE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {request.status} (expected one of {LICENSE_STATUSES})",
        )
    key_value = request.key or generate_license_key()
    if db.query(License).filter(License.key == key_value).first():
        raise HTTPException(status_code=400, detail="License key already exists")

    expires_at = None
    if request.expires_in_days:
        expires_at = utcnow() + timedelta(days=request.expires_in_days)

    license_ = License(
        key=key_value,
        product=request.product,
        owner_email=request.owner_email,
        status=request.status,
        expires_at=expires_at,
        max_activations=request.max_activations,
    )
    db.add(license_)
    db.commit()
    db.refresh(license_)
    return license_


def get_license(license_id: int, db: Session) -> License:
    license_ = db.query(License).filter(License.id == license_id).first()
    if not license_:
        raise HTTPException(status_code=404, detail="License not found")
    return license_


def list_licenses(
    db: Session,
    filter_: str = "all",
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    """List licenses, applying the frontend's filter values.

    filter: all | active | inactive | daily | weekly | monthly.
    status/search are additional optional filters.
    """
    query = db.query(License)

    if search:
        like = f"%{search}%"
        query = query.filter(
            (License.key.like(like))
            | (License.product.like(like))
            | (License.owner_email.like(like))
        )

    now = utcnow()
    if filter_ == "daily":
        query = query.filter(License.created_at >= now - timedelta(days=1))
    elif filter_ == "weekly":
        query = query.filter(License.created_at >= now - timedelta(days=7))
    elif filter_ == "monthly":
        query = query.filter(License.created_at >= now - timedelta(days=30))
    elif filter_ not in ("all", "active", "inactive"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid filter: {filter_} (expected all/active/inactive/daily/weekly/monthly)",
        )

    licenses = query.order_by(License.created_at.desc()).all()

    # Status filter: explicit `status` param wins, otherwise the `filter`
    # value doubles as a status filter for active/inactive.
    status_filter = status
    if status_filter is None and filter_ in ("active", "inactive"):
        status_filter = filter_
    if status_filter is not None:
        if status_filter not in ("active", "inactive"):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {status_filter} (expected active or inactive)",
            )
        want_active = status_filter == "active"
        licenses = [
            lic for lic in licenses if (lic.effective_status == "active") == want_active
        ]
    return licenses


def update_license(license_id: int, request: LicenseUpdateRequest, db: Session) -> License:
    license_ = get_license(license_id, db)
    if request.status is not None and request.status not in LICENSE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {request.status} (expected one of {LICENSE_STATUSES})",
        )
    if request.product is not None:
        license_.product = request.product
    if request.owner_email is not None:
        license_.owner_email = request.owner_email
    if request.status is not None:
        license_.status = request.status
    if request.expires_in_days is not None:
        license_.expires_at = utcnow() + timedelta(days=request.expires_in_days)
    if request.max_activations is not None:
        license_.max_activations = request.max_activations
    db.commit()
    db.refresh(license_)
    return license_


def delete_license(license_id: int, db: Session) -> None:
    license_ = get_license(license_id, db)
    db.delete(license_)
    db.commit()


def renew_license(license_id: int, extend_days: int, db: Session) -> License:
    """Extend a license's expiry by extend_days from its current expiry
    (or from now when it has no expiry / already expired)."""
    license_ = get_license(license_id, db)
    base = license_.expires_at or utcnow()
    if base < utcnow():
        base = utcnow()
    license_.expires_at = base + timedelta(days=extend_days)
    if license_.status in ("inactive", "revoked"):
        license_.status = "active"
    db.commit()
    db.refresh(license_)
    return license_


def validate_license(key: str, db: Session) -> tuple[bool, str, Optional[License]]:
    """Check a license key: exists, active, and not expired."""
    license_ = db.query(License).filter(License.key == key).first()
    if not license_:
        return False, "License key not found", None
    if license_.effective_status == "expired":
        return False, "License has expired", license_
    if license_.effective_status != "active":
        return False, f"License is {license_.effective_status}", license_
    if license_.activations >= license_.max_activations:
        return False, "Activation limit reached", license_
    return True, "License is valid", license_
