"""License routes (all require a JWT)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
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
from utils.auth import get_current_user

router = APIRouter()


@router.get("", response_model=List[LicenseResponse])
def list_licenses(
    filter: str = Query(default="all", description="all/active/inactive/daily/weekly/monthly"),
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """List licenses, optionally filtered by status/time/search."""
    licenses = license_service.list_licenses(db, filter_=filter, status=status, search=search)
    return [license_service.serialize_license(lic) for lic in licenses]


@router.post("", response_model=LicenseResponse, status_code=201)
def create_license(
    request: LicenseCreateRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    license_ = license_service.create_license(request, db)
    return license_service.serialize_license(license_)


@router.post("/validate", response_model=LicenseValidateResponse)
def validate_license(
    request: LicenseValidateRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """Validate a license key (exists, active, not expired, activations left)."""
    valid, detail, license_ = license_service.validate_license(request.key, db)
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
    _current_user=Depends(get_current_user),
):
    license_ = license_service.update_license(license_id, request, db)
    return license_service.serialize_license(license_)


@router.delete("/{license_id}", response_model=MessageResponse)
def delete_license(
    license_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    license_service.delete_license(license_id, db)
    return {"message": "License deleted successfully"}


@router.post("/{license_id}/renew", response_model=LicenseResponse)
def renew_license(
    license_id: int,
    request: LicenseRenewRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """Extend a license's expiry by the requested number of days."""
    license_ = license_service.renew_license(license_id, request.extend_days, db)
    return license_service.serialize_license(license_)
