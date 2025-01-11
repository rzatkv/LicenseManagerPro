from pydantic import BaseModel, Field, constr
from typing import List, Optional
from datetime import datetime


# کلاس‌های پاسخ‌ها

class AccessResponse(BaseModel):
    """
    پاسخ برای بررسی دسترسی کلید API.
    """
    access_rights: List[str]


# کلاس‌های درخواست‌ها

class AddApiKeyRequest(BaseModel):
    """
    مدل درخواست برای افزودن یک کلید API جدید.
    """
    key: constr(min_length=10, max_length=255) = Field(..., description="API Key value")  # ولیدیشن طول کلید
    access_rights: List[str] = Field(..., description="List of access rights for the API Key")
    expires_in_days: Optional[int] = Field(default=None, description="Number of days until the API Key expires")
    associated_ip: Optional[str] = Field(default=None, description="Restrict access to a specific IP address")
    associated_domain: Optional[str] = Field(default=None, description="Restrict access to a specific domain")
    associated_directory: Optional[str] = Field(default=None, description="Restrict access to a specific directory")
    single_use: bool = Field(default=False, description="Indicates if the key is single-use")


class UpdateApiKeyRequest(BaseModel):
    """
    مدل درخواست برای به‌روزرسانی یک کلید API.
    """
    access_rights: Optional[List[str]] = Field(default=None,
                                               description="Updated list of access rights for the API Key")
    expires_in_days: Optional[int] = Field(default=None, description="Number of days until the API Key expires")
    associated_ip: Optional[str] = Field(default=None, description="Updated IP address restriction")
    associated_domain: Optional[str] = Field(default=None, description="Updated domain restriction")
    associated_directory: Optional[str] = Field(default=None, description="Updated directory restriction")
    single_use: Optional[bool] = Field(default=None, description="Update single-use status of the key")


# کلاس‌های پاسخ برای کلیدهای API

class ApiKeyResponse(BaseModel):
    """
    مدل استاندارد پاسخ برای کلید API.
    """
    id: int
    key: str
    access_rights: List[str]
    expires_at: Optional[datetime]
    associated_ip: Optional[str]
    associated_domain: Optional[str]
    associated_directory: Optional[str]
    single_use: bool

    class Config:
        orm_mode = True  # پشتیبانی از تبدیل مستقیم SQLAlchemy


class ApiKeyListResponse(BaseModel):
    """
    مدل پاسخ برای لیست کردن کلیدهای API.
    """
    total: int = Field(..., description="Total number of API keys")
    api_keys: List[ApiKeyResponse] = Field(..., description="List of API keys")


# کلاس تنظیمات سیستم

class SystemSettingRequest(BaseModel):
    """
    مدل درخواست برای تنظیم یک مقدار خاص.
    """
    key: str
    value: str


class SystemSettingResponse(BaseModel):
    """
    مدل پاسخ برای تنظیمات سیستم.
    """
    key: str
    value: str
