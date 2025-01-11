from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from schemas import AddApiKeyRequest, UpdateApiKeyRequest, ApiKeyResponse, ApiKeyListResponse, AccessResponse
from services.api_keys import add_api_key, update_api_key, validate_api_key_usage

router = APIRouter()


@router.get("/check-access", response_model=AccessResponse)
def check_access(api_key: str = Header(...), db: Session = Depends(get_db)):
    """
    بررسی دسترسی یک کلید API.
    """
    api_key_entry = validate_api_key_usage(api_key, db)
    return {"access_rights": api_key_entry.access_rights.split(",")}


@router.post("/add-api-key", response_model=ApiKeyResponse)
def create_api_key(request: AddApiKeyRequest, db: Session = Depends(get_db)):
    """
    ایجاد یک کلید API جدید.
    """
    new_api_key = add_api_key(request, db)
    return {
        "id": new_api_key.id,
        "key": new_api_key.key,
        "access_rights": new_api_key.access_rights.split(","),
        "expires_at": new_api_key.expires_at,
        "associated_ip": new_api_key.associated_ip,
        "associated_domain": new_api_key.associated_domain,
        "associated_directory": new_api_key.associated_directory,
        "single_use": new_api_key.used_once,
    }


@router.put("/update-api-key/{api_key_id}", response_model=ApiKeyResponse)
def update_api_key_endpoint(api_key_id: int, request: UpdateApiKeyRequest, db: Session = Depends(get_db)):
    """
    به‌روزرسانی یک کلید API موجود.
    """
    updated_api_key = update_api_key(api_key_id, request, db)
    return {
        "id": updated_api_key.id,
        "key": updated_api_key.key,
        "access_rights": updated_api_key.access_rights.split(","),
        "expires_at": updated_api_key.expires_at,
        "associated_ip": updated_api_key.associated_ip,
        "associated_domain": updated_api_key.associated_domain,
        "associated_directory": updated_api_key.associated_directory,
        "single_use": updated_api_key.used_once,
    }
