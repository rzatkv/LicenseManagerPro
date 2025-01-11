from datetime import datetime, timedelta
from fastapi import HTTPException
from sqlalchemy.orm import Session
from models import ApiUsageLog, ApiKey


class RateLimiter:
    """
    کلاس مدیریت محدودیت نرخ درخواست‌ها.
    """

    def __init__(self, daily_limit: int = 100):
        self.daily_limit = daily_limit

    def check_limit(self, api_key: str, db: Session):
        """
        بررسی محدودیت نرخ برای کلید API.
        """
        # پیدا کردن کلید API
        api_key_entry = db.query(ApiKey).filter(ApiKey.key == api_key).first()
        if not api_key_entry:
            raise HTTPException(status_code=403, detail="Invalid API Key")

        today = datetime.utcnow().date()

        # پیدا کردن لاگ استفاده امروز
        usage_entry = db.query(ApiUsageLog).filter(
            ApiUsageLog.api_key_id == api_key_entry.id, ApiUsageLog.date >= today
        ).first()

        if usage_entry:
            if usage_entry.request_count >= self.daily_limit:
                raise HTTPException(status_code=429, detail="Daily request limit exceeded")
            usage_entry.request_count += 1
        else:
            usage_entry = ApiUsageLog(api_key_id=api_key_entry.id, date=today, request_count=1)
            db.add(usage_entry)

        db.commit()

    def reset_usage(self, db: Session):
        """
        ریست کردن درخواست‌های همه کلیدها (مثلاً در پایان روز).
        """
        today = datetime.utcnow().date()
        db.query(ApiUsageLog).filter(ApiUsageLog.date < today).delete()
        db.commit()
