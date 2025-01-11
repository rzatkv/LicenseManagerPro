from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class ApiKey(Base):
    """
    مدل مربوط به جدول کلیدهای API.
    """
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(255), unique=True, index=True, nullable=False)  # مقدار کلید
    access_rights = Column(Text, nullable=False)  # دسترسی‌ها به صورت کاما جداشده
    expires_at = Column(DateTime, nullable=True)  # تاریخ انقضای کلید
    associated_ip = Column(String(45), nullable=True)  # محدودیت IP
    associated_domain = Column(String(255), nullable=True)  # محدودیت دامنه
    associated_directory = Column(String(255), nullable=True)  # محدودیت دایرکتوری
    used_once = Column(Boolean, default=False, nullable=False)  # وضعیت استفاده برای کلید یکبار مصرف

    # ارتباط با جدول لاگ استفاده
    usage_logs = relationship(
        "ApiUsageLog",
        back_populates="api_key",
        cascade="all, delete-orphan"  # حذف لاگ‌های مرتبط هنگام حذف کلید
    )


class ApiUsageLog(Base):
    """
    مدل مربوط به جدول لاگ استفاده از کلیدهای API.
    """
    __tablename__ = "api_usage_log"

    id = Column(Integer, primary_key=True, index=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=False)  # ارتباط با کلید API
    date = Column(DateTime, default=datetime.utcnow)  # تاریخ استفاده
    request_count = Column(Integer, default=0)  # تعداد درخواست‌ها در یک روز

    # ارتباط با جدول کلیدهای API
    api_key = relationship("ApiKey", back_populates="usage_logs")


class SystemSetting(Base):
    """
    مدل مربوط به جدول تنظیمات سیستم.
    """
    __tablename__ = "system_settings"

    key = Column(String(255), primary_key=True)  # کلید تنظیم
    value = Column(Text, nullable=False)  # مقدار تنظیم
