"""API key business logic: creation, update, and validated usage.

Validation enforces everything the old code skipped: expiry, single-use
consumption, IP/domain/directory restrictions, and the daily request limit
(configurable via the "daily_request_limit" system setting).
"""
import secrets
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config import DAILY_REQUEST_LIMIT
from database import utcnow
from models import ApiKey, ApiUsageLog
from schemas import AddApiKeyRequest, UpdateApiKeyRequest

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


def _daily_limit(db: Session) -> int:
    """Daily request limit from the system setting, falling back to the env default."""
    from models import SystemSetting

    setting = db.query(SystemSetting).filter(
        SystemSetting.key == "daily_request_limit"
    ).first()
    if setting is None:
        return DAILY_REQUEST_LIMIT
    try:
        return int(setting.value)
    except (TypeError, ValueError):
        return DAILY_REQUEST_LIMIT


def generate_api_key() -> str:
    """Generate a random, URL-safe API key."""
    return "lmp_" + secrets.token_urlsafe(32)


def validate_api_key_usage(
    api_key: str,
    db: Session,
    client_ip: Optional[str] = None,
    domain: Optional[str] = None,
    directory: Optional[str] = None,
) -> ApiKey:
    """Validate an API key and record one use of it.

    Raises 403 for an unknown, expired, already-consumed single-use key, or
    a key used from a disallowed IP/domain/directory; 429 when the daily
    request limit for the key is reached. A blacklisted IP or domain
    (v2.2) is rejected before anything else is looked at.
    """
    from services import blacklist as blacklist_service

    blocked = blacklist_service.is_blacklisted(db, ip=client_ip, domain=domain)
    if blocked:
        raise HTTPException(status_code=403, detail="blocked: blacklisted")
    entry = db.query(ApiKey).filter(ApiKey.key == api_key).first()
    if not entry:
        raise HTTPException(status_code=403, detail="Invalid API Key")

    now = utcnow()
    if entry.expires_at and entry.expires_at < now:
        raise HTTPException(status_code=403, detail="API Key has expired")

    if entry.single_use and entry.consumed:
        raise HTTPException(status_code=403, detail="Single-use API Key already used")

    if entry.associated_ip and client_ip and entry.associated_ip != client_ip:
        raise HTTPException(status_code=403, detail="API Key is restricted to another IP")
    if entry.associated_domain and domain and entry.associated_domain != domain:
        raise HTTPException(
            status_code=403, detail="API Key is restricted to another domain"
        )
    if entry.associated_directory and directory and entry.associated_directory != directory:
        raise HTTPException(
            status_code=403, detail="API Key is restricted to another directory"
        )

    today = date.today()
    usage = (
        db.query(ApiUsageLog)
        .filter(ApiUsageLog.api_key_id == entry.id, ApiUsageLog.date == today)
        .first()
    )
    if usage and usage.request_count >= _daily_limit(db):
        raise HTTPException(status_code=429, detail="Daily request limit exceeded")
    if usage:
        usage.request_count += 1
    else:
        db.add(ApiUsageLog(api_key_id=entry.id, date=today, request_count=1))

    if entry.single_use:
        entry.consumed = True

    db.commit()
    db.refresh(entry)
    return entry


def add_api_key(request: AddApiKeyRequest, db: Session) -> ApiKey:
    """Create a new API key (generating a random value when none is supplied)."""
    for right in request.access_rights:
        if right not in ACCESS_RIGHTS:
            raise HTTPException(status_code=400, detail=f"Invalid access right: {right}")

    key_value = request.key or generate_api_key()
    if db.query(ApiKey).filter(ApiKey.key == key_value).first():
        raise HTTPException(status_code=400, detail="API Key already exists")

    expires_at = None
    if request.expires_in_days:
        expires_at = utcnow() + timedelta(days=request.expires_in_days)

    new_key = ApiKey(
        key=key_value,
        access_rights=",".join(request.access_rights),
        expires_at=expires_at,
        associated_ip=request.associated_ip,
        associated_domain=request.associated_domain,
        associated_directory=request.associated_directory,
        single_use=request.single_use,
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)
    return new_key


def update_api_key(api_key_id: int, request: UpdateApiKeyRequest, db: Session) -> ApiKey:
    """Update an existing API key."""
    entry = db.query(ApiKey).filter(ApiKey.id == api_key_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="API Key not found")

    if request.access_rights is not None:
        for right in request.access_rights:
            if right not in ACCESS_RIGHTS:
                raise HTTPException(status_code=400, detail=f"Invalid access right: {right}")
        entry.access_rights = ",".join(request.access_rights)

    if request.expires_in_days is not None:
        entry.expires_at = utcnow() + timedelta(days=request.expires_in_days)

    if request.associated_ip is not None:
        entry.associated_ip = request.associated_ip
    if request.associated_domain is not None:
        entry.associated_domain = request.associated_domain
    if request.associated_directory is not None:
        entry.associated_directory = request.associated_directory
    if request.single_use is not None:
        entry.single_use = request.single_use
        if not request.single_use:
            entry.consumed = False

    db.commit()
    db.refresh(entry)
    return entry


def delete_api_key(api_key_id: int, db: Session) -> None:
    entry = db.query(ApiKey).filter(ApiKey.id == api_key_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="API Key not found")
    db.delete(entry)
    db.commit()
