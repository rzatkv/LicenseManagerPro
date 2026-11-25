"""License routes (all require a JWT).

Writes are permission-gated (v2.0): create needs licenses:create, update
licenses:write, delete licenses:delete, renew licenses:renew. Reads and
validate are open to any authenticated role.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    LicenseCreateRequest,
    LicenseRenewRequest,
    LicenseResponse,
    LicenseUpdateRequest,
    LicenseValidateRequest,
    LicenseValidateResponse,
    MessageResponse,
)
from services import licenses as license_service
from services import webhooks as webhook_service
from services.audit import log_audit
from utils.auth import get_current_user
from utils.pagination import Pagination, paginate_list, pagination_params
from utils.permissions import require_permission
from utils.rate_limit import rate_limit_validate

router = APIRouter()


@router.get("", response_model=List[LicenseResponse])
def list_licenses(
    response: Response,
    filter: str = Query(default="all", description="all/active/inactive/daily/weekly/monthly"),
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """List licenses, optionally filtered by status/time/search."""
    licenses = license_service.list_licenses(db, filter_=filter, status=status, search=search)
    return paginate_list(
        [license_service.serialize_license(lic) for lic in licenses], response, page
    )


@router.post("", response_model=LicenseResponse, status_code=201)
def create_license(
    request: LicenseCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("licenses:create")),
):
    license_ = license_service.create_license(request, db)
    log_audit(
        db,
        current_user.email,
        "license.create",
        "license",
        license_.id,
        {"key": license_.key, "product": license_.product},
    )
    return license_service.serialize_license(license_)


@router.post("/validate", response_model=LicenseValidateResponse)
def validate_license(
    request: LicenseValidateRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
    _rate_limited=Depends(rate_limit_validate),
):
    """Validate a license key (exists, active, not expired, activations left,
    plus domain/IP/install-path locks when set)."""
    valid, detail, license_ = license_service.validate_license(
        request.key,
        db,
        domain=request.domain,
        ip=request.ip,
        install_path=request.install_path,
    )
    if not valid and license_ is not None and license_.product_id is not None:
        webhook_service.notify_license_event(
            db,
            license_,
            webhook_service.EVENT_LICENSE_VALIDATED_FAILED,
            reason=detail,
        )
    return {
        "valid": valid,
        "detail": detail,
        "license": license_service.serialize_license(license_) if license_ else None,
    }


@router.get("/{license_id}", response_model=LicenseResponse)
def get_license(
    license_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    license_ = license_service.get_license(license_id, db)
    return license_service.serialize_license(license_)


@router.put("/{license_id}", response_model=LicenseResponse)
def update_license(
    license_id: int,
    request: LicenseUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("licenses:write")),
):
    license_ = license_service.update_license(license_id, request, db)
    log_audit(
        db,
        current_user.email,
        "license.update",
        "license",
        license_.id,
        {"key": license_.key},
    )
    return license_service.serialize_license(license_)


@router.delete("/{license_id}", response_model=MessageResponse)
def delete_license(
    license_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("licenses:delete")),
):
    license_service.delete_license(license_id, db)
    log_audit(db, current_user.email, "license.delete", "license", license_id)
    return {"message": "License deleted successfully"}


@router.post("/{license_id}/renew", response_model=LicenseResponse)
def renew_license(
    license_id: int,
    request: LicenseRenewRequest = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("licenses:renew")),
):
    """Renew a license: by its billing_cycle, or by extend_days when given."""
    extend_days = request.extend_days if request is not None else None
    license_ = license_service.renew_license(license_id, db, extend_days=extend_days)
    log_audit(
        db,
        current_user.email,
        "license.renew",
        "license",
        license_.id,
        {"key": license_.key},
    )
    return license_service.serialize_license(license_)
