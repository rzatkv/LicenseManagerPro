"""System settings business logic (unchanged behaviour, SQLAlchemy 2.x)."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import SystemSetting


def get_setting(db: Session, key: str) -> str:
    """Return the value of one setting, or 404 when it does not exist."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return setting.value


def update_setting(db: Session, key: str, value: str):
    """Create or update a setting."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = SystemSetting(key=key, value=value)
        db.add(setting)
    db.commit()
    return {"message": f"Setting '{key}' updated successfully"}


def get_all_settings(db: Session) -> dict:
    """Return all settings as a {key: value} dict."""
    settings = db.query(SystemSetting).all()
    return {setting.key: setting.value for setting in settings}


def delete_setting(db: Session, key: str) -> None:
    """Delete a setting, or 404 when it does not exist."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    db.delete(setting)
    db.commit()
