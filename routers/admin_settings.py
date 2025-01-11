from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from schemas import SystemSettingRequest, SystemSettingResponse
from services.settings import get_setting, update_setting, get_all_settings

router = APIRouter()


@router.get("/settings", response_model=dict)
def get_all_system_settings(db: Session = Depends(get_db)):
    """
    دریافت تمام تنظیمات سیستم.
    """
    settings = get_all_settings(db)
    return settings


@router.get("/settings/{key}", response_model=SystemSettingResponse)
def get_system_setting(key: str, db: Session = Depends(get_db)):
    """
    دریافت مقدار یک تنظیم خاص.
    """
    value = get_setting(db, key)
    return {"key": key, "value": value}


@router.put("/settings/{key}", response_model=dict)
def update_system_setting(key: str, request: SystemSettingRequest, db: Session = Depends(get_db)):
    """
    به‌روزرسانی یا ایجاد یک تنظیم جدید.
    """
    if key != request.key:
        raise HTTPException(status_code=400, detail="Key in path and body must match")
    update_setting(db, key, request.value)
    return {"message": f"Setting '{key}' updated successfully"}
