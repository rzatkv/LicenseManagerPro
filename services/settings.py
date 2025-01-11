from sqlalchemy.orm import Session
from models import SystemSetting
from fastapi import HTTPException


def get_setting(db: Session, key: str) -> str:
    """
    دریافت مقدار یک تنظیم خاص از پایگاه داده.
    """
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return setting.value


def update_setting(db: Session, key: str, value: str):
    """
    به‌روزرسانی یا ایجاد یک تنظیم جدید.
    """
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = SystemSetting(key=key, value=value)
        db.add(setting)
    db.commit()
    return {"message": f"Setting '{key}' updated successfully"}


def get_all_settings(db: Session) -> dict:
    """
    دریافت تمام تنظیمات موجود در سیستم.
    """
    settings = db.query(SystemSetting).all()
    return {setting.key: setting.value for setting in settings}
