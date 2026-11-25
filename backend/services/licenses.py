"""License business logic."""
import calendar
import json
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database import utcnow
from models import License, Product
from schemas import LicenseCreateRequest, LicenseUpdateRequest

LICENSE_STATUSES = ["active", "inactive", "revoked"]


def add_months(moment: datetime, months: int) -> datetime:
    """Calendar-month arithmetic (not a 30-day approximation)."""
    month_index = moment.month - 1 + months
    year = moment.year + month_index // 12
    month = month_index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def _split_csv(value: Optional[str]) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _join_csv(values) -> Optional[str]:
    if values is None:
        return None
    if isinstance(values, str):
        return values or None
    cleaned = [str(v).strip() for v in values if str(v).strip()]
    return ",".join(cleaned) if cleaned else None


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
        "product_id": license_.product_id,
        "billing_cycle": license_.billing_cycle,
        "allowed_domains": _split_csv(license_.allowed_domains),
        "allowed_ips": _split_csv(license_.allowed_ips),
        "install_path": license_.install_path,
        "owner_email": license_.owner_email,
        "status": license_.effective_status,
        "expires_at": license_.expires_at,
        "max_activations": license_.max_activations,
        "activations": license_.activations,
        "created_at": license_.created_at,
        "updated_at": license_.updated_at,
    }


def create_license(request: LicenseCreateRequest, db: Session) -> License:
    from services import products as product_service
    from services import webhooks as webhook_service

    if request.status not in LICENSE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {request.status} (expected one of {LICENSE_STATUSES})",
        )
    key_value = request.key or generate_license_key()
    if db.query(License).filter(License.key == key_value).first():
        raise HTTPException(status_code=400, detail="License key already exists")

    product_name = request.product
    product_id = request.product_id
    billing_cycle = request.billing_cycle
    expires_at = None
    if product_id is not None:
        # Product-linked license: expiry comes from the billing cycle.
        product = product_service.get_product(product_id, db)
        if not billing_cycle:
            raise HTTPException(
                status_code=400,
                detail="billing_cycle is required when product_id is given",
            )
        try:
            cycles = product_service.validate_billing_cycles(
                json.loads(product.billing_cycles or "[]")
            )
        except HTTPException:
            cycles = []
        if billing_cycle not in cycles:
            raise HTTPException(
                status_code=400,
                detail=f"billing_cycle '{billing_cycle}' is not offered by product '{product.slug}'",
            )
        if billing_cycle == "lifetime":
            expires_at = None
        else:
            months = product_service.CYCLE_MONTHS[billing_cycle]
            expires_at = add_months(utcnow(), months)
        if not product_name:
            product_name = product.name
    else:
        if not product_name:
            raise HTTPException(
                status_code=400,
                detail="product is required when product_id is not given",
            )
        if request.expires_in_days:
            expires_at = utcnow() + timedelta(days=request.expires_in_days)

    license_ = License(
        key=key_value,
        product=product_name,
        product_id=product_id,
        billing_cycle=billing_cycle,
        allowed_domains=_join_csv(request.allowed_domains),
        allowed_ips=_join_csv(request.allowed_ips),
        install_path=request.install_path,
        owner_email=request.owner_email,
        status=request.status,
        expires_at=expires_at,
        max_activations=request.max_activations,
    )
    db.add(license_)
    db.commit()
    db.refresh(license_)
    webhook_service.notify_license_event(
        db, license_, webhook_service.EVENT_LICENSE_CREATED
    )
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
    from services import products as product_service

    license_ = get_license(license_id, db)
    if request.status is not None and request.status not in LICENSE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {request.status} (expected one of {LICENSE_STATUSES})",
        )
    if request.product_id is not None:
        product_service.get_product(request.product_id, db)
        license_.product_id = request.product_id
    if request.billing_cycle is not None:
        product_id = (
            request.product_id
            if request.product_id is not None
            else license_.product_id
        )
        if product_id is not None:
            product = product_service.get_product(product_id, db)
            cycles = json.loads(product.billing_cycles or "[]")
            if request.billing_cycle not in cycles:
                raise HTTPException(
                    status_code=400,
                    detail=f"billing_cycle '{request.billing_cycle}' is not offered by product '{product.slug}'",
                )
        elif request.billing_cycle not in product_service.BILLING_CYCLES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid billing_cycle: {request.billing_cycle}",
            )
        license_.billing_cycle = request.billing_cycle
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
    if request.allowed_domains is not None:
        license_.allowed_domains = _join_csv(request.allowed_domains)
    if request.allowed_ips is not None:
        license_.allowed_ips = _join_csv(request.allowed_ips)
    if request.install_path is not None:
        license_.install_path = request.install_path
    db.commit()
    db.refresh(license_)
    return license_


def delete_license(license_id: int, db: Session) -> None:
    from services import webhooks as webhook_service

    license_ = get_license(license_id, db)
    # Capture the payload data before the row is gone.
    product = None
    if license_.product_id is not None:
        product = (
            db.query(Product).filter(Product.id == license_.product_id).first()
        )
    payload = webhook_service.license_payload(
        license_, product, webhook_service.EVENT_LICENSE_REVOKED
    )
    db.delete(license_)
    db.commit()
    if product is not None:
        webhook_service.dispatch_webhook(
            db, product, webhook_service.EVENT_LICENSE_REVOKED, payload
        )


def renew_license(
    license_id: int, db: Session, extend_days: Optional[int] = None
) -> License:
    """Renew a license.

    - When extend_days is explicitly passed it wins (legacy behaviour).
    - Otherwise the license's own billing_cycle decides: monthly/quarterly/
      semiannual/annual/biennial extend by that many calendar months.
    - Lifetime licenses cannot be renewed (400).
    - A license without a billing_cycle and without extend_days falls back
      to +30 days.
    """
    from services import products as product_service
    from services import webhooks as webhook_service

    license_ = get_license(license_id, db)
    if license_.billing_cycle == "lifetime":
        raise HTTPException(
            status_code=400, detail="cannot renew a lifetime license"
        )
    base = license_.expires_at or utcnow()
    if base < utcnow():
        base = utcnow()
    if extend_days is not None:
        license_.expires_at = base + timedelta(days=extend_days)
    elif license_.billing_cycle in product_service.CYCLE_MONTHS:
        license_.expires_at = add_months(
            base, product_service.CYCLE_MONTHS[license_.billing_cycle]
        )
    else:
        license_.expires_at = base + timedelta(days=30)
    if license_.status in ("inactive", "revoked"):
        license_.status = "active"
    db.commit()
    db.refresh(license_)
    webhook_service.notify_license_event(
        db, license_, webhook_service.EVENT_LICENSE_RENEWED
    )
    return license_


def _domain_matches(requested: str, allowed: str) -> bool:
    """Case-insensitive exact or subdomain match."""
    requested = requested.strip().lower()
    allowed = allowed.strip().lower()
    return requested == allowed or requested.endswith("." + allowed)


def validate_license(
    key: str,
    db: Session,
    domain: Optional[str] = None,
    ip: Optional[str] = None,
    install_path: Optional[str] = None,
) -> tuple[bool, str, Optional[License]]:
    """Check a license key: exists, active, not expired, activations left,
    and (when set) domain/IP/install-path locks."""
    license_ = db.query(License).filter(License.key == key).first()
    if not license_:
        return False, "License key not found", None
    if license_.effective_status == "expired":
        return False, "License has expired", license_
    if license_.effective_status != "active":
        return False, f"License is {license_.effective_status}", license_
    if license_.activations >= license_.max_activations:
        return False, "Activation limit reached", license_
    allowed_domains = _split_csv(license_.allowed_domains)
    if allowed_domains:
        if not domain or not any(
            _domain_matches(domain, allowed) for allowed in allowed_domains
        ):
            return False, "domain not allowed", license_
    allowed_ips = _split_csv(license_.allowed_ips)
    if allowed_ips:
        if not ip or ip.strip() not in [a.strip() for a in allowed_ips]:
            return False, "ip not allowed", license_
    if license_.install_path:
        if not install_path or install_path != license_.install_path:
            return False, "install path not allowed", license_
    return True, "License is valid", license_
