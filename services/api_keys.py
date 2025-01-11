from sqlalchemy.orm import Session
from models import ApiKey, ApiUsageLog
from schemas import AddApiKeyRequest, UpdateApiKeyRequest
from datetime import datetime, timedelta
from fastapi import HTTPException

DAILY_REQUEST_LIMIT = 100  # محدودیت پیش‌فرض تعداد درخواست‌ها در روز
ACCESS_RIGHTS = [
    "create_license",
    "edit_license",
    "delete_license",
    "get_license_info",
    "renew_license",
    "remove_access",
    "add_access",
    "change_access_key",
    "create_temporary_access_key",
]


def validate_api_key_usage(api_key: str, db: Session):
    """
    اعتبارسنجی و ثبت استفاده از کلید API.
    """
    api_key_entry = db.query(ApiKey).filter(ApiKey.key == api_key).first()
    if not api_key_entry:
        raise HTTPException(status_code=403, detail="Invalid API Key")

    today = datetime.utcnow().date()
    usage_entry = db.query(ApiUsageLog).filter(
        ApiUsageLog.api_key_id == api_key_entry.id, ApiUsageLog.date >= today
    ).first()

    if usage_entry and usage_entry.request_count >= DAILY_REQUEST_LIMIT:
        raise HTTPException(status_code=429, detail="Daily request limit exceeded")
    elif usage_entry:
        usage_entry.request_count += 1
    else:
        usage_entry = ApiUsageLog(api_key_id=api_key_entry.id, date=today, request_count=1)
        db.add(usage_entry)

    db.commit()
    return api_key_entry


def add_api_key(request: AddApiKeyRequest, db: Session):
    """
    افزودن کلید API جدید.
    """
    for right in request.access_rights:
        if right not in ACCESS_RIGHTS:
            raise HTTPException(status_code=400, detail=f"Invalid access right: {right}")

    if db.query(ApiKey).filter(ApiKey.key == request.key).first():
        raise HTTPException(status_code=400, detail="API Key already exists")

    expires_at = None
    if request.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=request.expires_in_days)

    new_api_key = ApiKey(
        key=request.key,
        access_rights=",".join(request.access_rights),
        expires_at=expires_at,
        associated_ip=request.associated_ip,
        associated_domain=request.associated_domain,
        associated_directory=request.associated_directory,
        used_once=request.single_use
    )
    db.add(new_api_key)
    db.commit()
    db.refresh(new_api_key)

    return new_api_key


def update_api_key(api_key_id: int, request: UpdateApiKeyRequest, db: Session):
    """
    به‌روزرسانی یک کلید API موجود.
    """
    api_key_entry = db.query(ApiKey).filter(ApiKey.id == api_key_id).first()
    if not api_key_entry:
        raise HTTPException(status_code=404, detail="API Key not found")

    if request.access_rights:
        for right in request.access_rights:
            if right not in ACCESS_RIGHTS:
                raise HTTPException(status_code=400, detail=f"Invalid access right: {right}")
        api_key_entry.access_rights = ",".join(request.access_rights)

    if request.expires_in_days is not None:
        api_key_entry.expires_at = datetime.utcnow() + timedelta(days=request.expires_in_days)

    if request.associated_ip is not None:
        api_key_entry.associated_ip = request.associated_ip

    if request.associated_domain is not None:
        api_key_entry.associated_domain = request.associated_domain

    if request.associated_directory is not None:
        api_key_entry.associated_directory = request.associated_directory

    if request.single_use is not None:
        api_key_entry.used_once = request.single_use

    db.commit()
    db.refresh(api_key_entry)

    return api_key_entry
