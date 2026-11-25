"""API key routes.

CRUD endpoints require a JWT (admin panel); the check-access endpoint is
public because it is how external clients validate a key.

v2.3: the secret is never stored and never listed — list/get return only
the display prefix; the full secret is returned ONCE at creation and at
rotation (``plain_key``). Module-scoped keys (scopes=["module"]) are
time-limited (30/90/180/365 days) and can require HMAC-signed requests.
"""

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy.orm import Session

from database import escape_like, get_db
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
from services.audit import log_audit
from utils.auth import get_current_user
from utils.pagination import Pagination, pagination_params
from utils.permissions import require_permission
from utils.rate_limit import rate_limit_validate

router = APIRouter()


@router.get("/check-access", response_model=AccessResponse)
def check_access(
    request: Request,
    api_key: str = Header(..., alias="api-key"),
    domain: str | None = Query(default=None),
    directory: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _rate_limited=Depends(rate_limit_validate),
):
    """Validate an API key (public endpoint used by external clients)."""
    client_ip = request.client.host if request.client else None
    entry = api_key_service.validate_api_key_usage(
        api_key, db, client_ip=client_ip, domain=domain, directory=directory
    )
    return {"access_rights": entry.access_rights.split(",")}


@router.get("", response_model=ApiKeyListResponse)
def list_api_keys(
    response: Response,
    page: Pagination = Depends(pagination_params),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """List API keys with pagination and optional search (matches the
    display prefix — the secret itself is never stored or searchable)."""
    query = db.query(ApiKey)
    if search:
        like = f"%{escape_like(search)}%"
        query = query.filter(ApiKey.key.like(like, escape="\\"))
    total = query.count()
    keys = query.order_by(ApiKey.id.desc()).offset(page.skip).limit(page.limit).all()
    response.headers["X-Total-Count"] = str(total)
    return {
        "total": total,
        "api_keys": [api_key_service.serialize_api_key(k) for k in keys],
    }


@router.post("", response_model=ApiKeyResponse, status_code=201)
def create_api_key(
    request: AddApiKeyRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("api_keys:create")),
):
    """Create an API key. The plaintext secret is returned ONCE in
    ``plain_key`` — copy it now; it is never shown again."""
    entry, plain_key = api_key_service.add_api_key(request, db)
    log_audit(db, current_user.email, "api_key.create", "api_key", entry.id)
    return api_key_service.serialize_api_key(entry, plain_key=plain_key)


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
    return api_key_service.serialize_api_key(entry)


@router.post("/{api_key_id}/rotate", response_model=ApiKeyResponse)
def rotate_api_key(
    api_key_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("api_keys:write")),
):
    """Rotate a key: a new secret is generated, the old one stops working
    immediately. The new secret is returned ONCE in ``plain_key``."""
    entry, plain_key = api_key_service.rotate_api_key(api_key_id, db)
    log_audit(db, current_user.email, "api_key.rotate", "api_key", entry.id)
    return api_key_service.serialize_api_key(entry, plain_key=plain_key)


@router.put("/{api_key_id}", response_model=ApiKeyResponse)
def update_api_key(
    api_key_id: int,
    request: UpdateApiKeyRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("api_keys:write")),
):
    """Update an existing API key (the secret itself never changes here —
    use rotation for that)."""
    entry = api_key_service.update_api_key(api_key_id, request, db)
    log_audit(db, current_user.email, "api_key.update", "api_key", entry.id)
    return api_key_service.serialize_api_key(entry)


@router.delete("/{api_key_id}", response_model=MessageResponse)
def delete_api_key(
    api_key_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("api_keys:write")),
):
    api_key_service.delete_api_key(api_key_id, db)
    log_audit(db, current_user.email, "api_key.delete", "api_key", api_key_id)
    return {"message": "API Key deleted successfully"}
