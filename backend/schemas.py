"""Pydantic v2 request/response schemas."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# --- Auth -------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="At least 8 characters")
    role: str = Field(default="admin", description="admin or user")


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: str = Field(default="user", description="admin or user")


class UserUpdateRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: str
    is_active: bool
    created_at: datetime


# --- API keys ---------------------------------------------------------------

class AccessResponse(BaseModel):
    access_rights: List[str]


class AddApiKeyRequest(BaseModel):
    key: Optional[str] = Field(
        default=None,
        min_length=10,
        max_length=255,
        description="API key value; generated server-side when omitted",
    )
    access_rights: List[str] = Field(..., description="List of access rights")
    expires_in_days: Optional[int] = Field(default=None, description="Days until expiry")
    associated_ip: Optional[str] = None
    associated_domain: Optional[str] = None
    associated_directory: Optional[str] = None
    single_use: bool = False


class UpdateApiKeyRequest(BaseModel):
    access_rights: Optional[List[str]] = None
    expires_in_days: Optional[int] = None
    associated_ip: Optional[str] = None
    associated_domain: Optional[str] = None
    associated_directory: Optional[str] = None
    single_use: Optional[bool] = None


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    access_rights: List[str]
    expires_at: Optional[datetime] = None
    associated_ip: Optional[str] = None
    associated_domain: Optional[str] = None
    associated_directory: Optional[str] = None
    single_use: bool
    consumed: bool = False
    created_at: Optional[datetime] = None

    @field_validator("access_rights", mode="before")
    @classmethod
    def _split_rights(cls, value):
        # Stored as a comma-separated string in the database.
        if isinstance(value, str):
            return [part for part in value.split(",") if part]
        return value


class ApiKeyListResponse(BaseModel):
    total: int
    api_keys: List[ApiKeyResponse]


# --- Licenses ---------------------------------------------------------------

class LicenseCreateRequest(BaseModel):
    key: Optional[str] = Field(
        default=None, description="License key; generated server-side when omitted"
    )
    product: str
    owner_email: Optional[EmailStr] = None
    status: str = Field(default="active", description="active / inactive / revoked")
    expires_in_days: Optional[int] = Field(default=None, description="Days until expiry")
    max_activations: int = Field(default=1, ge=1)


class LicenseUpdateRequest(BaseModel):
    product: Optional[str] = None
    owner_email: Optional[EmailStr] = None
    status: Optional[str] = None
    expires_in_days: Optional[int] = None
    max_activations: Optional[int] = Field(default=None, ge=1)


class LicenseRenewRequest(BaseModel):
    extend_days: int = Field(default=30, gt=0, description="Days to extend the expiry by")


class LicenseValidateRequest(BaseModel):
    key: str


class LicenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    product: str
    owner_email: Optional[str] = None
    status: str  # effective status (expired is derived on read)
    expires_at: Optional[datetime] = None
    max_activations: int
    activations: int
    created_at: datetime
    updated_at: datetime


class LicenseValidateResponse(BaseModel):
    valid: bool
    detail: str
    license: Optional[LicenseResponse] = None


# --- Settings ---------------------------------------------------------------

class SystemSettingRequest(BaseModel):
    key: str
    value: str


class SystemSettingResponse(BaseModel):
    key: str
    value: str


# --- Dashboard / system -----------------------------------------------------

class DashboardSummaryResponse(BaseModel):
    apiKeysCount: int
    usersCount: int
    activeLicenses: int
    inactiveLicenses: int


class SystemInfoResponse(BaseModel):
    version: str
    lastUpdated: str


class CheckUpdatesResponse(BaseModel):
    updateAvailable: bool
    currentVersion: str
    latestVersion: str


class MessageResponse(BaseModel):
    message: str
