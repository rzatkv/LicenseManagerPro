"""API key routes.

CRUD endpoints require a JWT (admin panel); the check-access endpoint is
public because it is how external clients validate a key.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.orm import Session

from database import get_db
from models import ApiKey
from schemas import (
    AccessResponse,
    AddApiKeyRequest,
    ApiKeyListResponse,
    ApiKeyResponse,
    MessageResponse,
    UpdateApiKeyRequest,
)
from services import api_keys as api_key_service
from utils.auth import get_current_user

router = APIRouter()


@router.get("/check-access", response_model=AccessResponse)
def check_access(
    request: Request,
    api_key: str = Header(..., alias="api-key"),
    domain: Optional[str] = Query(default=None),
    directory: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Validate an API key (public endpoint used by external clients)."""
    client_ip = request.client.host if request.client else None
    entry = api_key_service.validate_api_key_usage(
        api_key, db, client_ip=client_ip, domain=domain, directory=directory
    )
    return {"access_rights": entry.access_rights.split(",")}


@router.get("", response_model=ApiKeyListResponse)
def list_api_keys(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """List API keys with pagination and optional search."""
    query = db.query(ApiKey)
    if search:
        like = f"%{search}%"
        query = query.filter(ApiKey.key.like(like))
    total = query.count()
    keys = query.order_by(ApiKey.id.desc()).offset(skip).limit(limit).all()
    return {"total": total, "api_keys": keys}


@router.post("", response_model=ApiKeyResponse, status_code=201)
def create_api_key(
    request: AddApiKeyRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """Create an API key (a random key is generated when none is supplied)."""
    return api_key_service.add_api_key(request, db)


@router.get("/{api_key_id}", response_model=ApiKeyResponse)
def get_api_key(
    api_key_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    entry = db.query(ApiKey).filter(ApiKey.id == api_key_id).first()
    if not entry:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="API Key not found")
    return entry


@router.put("/{api_key_id}", response_model=ApiKeyResponse)
def update_api_key(
    api_key_id: int,
    request: UpdateApiKeyRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """Update an existing API key."""
    return api_key_service.update_api_key(api_key_id, request, db)


@router.delete("/{api_key_id}", response_model=MessageResponse)
def delete_api_key(
    api_key_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    api_key_service.delete_api_key(api_key_id, db)
    return {"message": "API Key deleted successfully"}
