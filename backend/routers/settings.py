"""System settings routes (all require a JWT). Mounted at /api/settings."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from schemas import SystemSettingRequest, SystemSettingResponse
from services.settings import (
    delete_setting,
    get_all_settings,
    get_setting,
    update_setting,
)
from utils.auth import get_current_user

router = APIRouter()


@router.get("", response_model=dict)
def get_all_system_settings(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """Return all system settings as a {key: value} object."""
    return get_all_settings(db)


@router.get("/{key}", response_model=SystemSettingResponse)
def get_system_setting(
    key: str,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """Return the value of one setting."""
    value = get_setting(db, key)
    return {"key": key, "value": value}


@router.put("/{key}", response_model=dict)
def update_system_setting(
    key: str,
    request: SystemSettingRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """Create or update one setting."""
    if key != request.key:
        raise HTTPException(status_code=400, detail="Key in path and body must match")
    update_setting(db, key, request.value)
    return {"message": f"Setting '{key}' updated successfully"}


@router.delete("/{key}", response_model=dict)
def delete_system_setting(
    key: str,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """Delete one setting."""
    delete_setting(db, key)
    return {"message": f"Setting '{key}' deleted successfully"}
