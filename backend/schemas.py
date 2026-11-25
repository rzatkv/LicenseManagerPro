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
    role: str = Field(default="admin", description="admin, manager, support or viewer")


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: str = Field(default="viewer", description="admin, manager, support or viewer")


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


# --- Products (v2.0) ------------------------------------------------------

BILLING_CYCLES = ["monthly", "quarterly", "semiannual", "annual", "biennial", "lifetime"]


class ProductCreateRequest(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    currency: str = "USD"
    status: str = "active"
    billing_cycles: List[str] = Field(..., description="Non-empty subset of the six cycles")
    webhook_url: Optional[str] = None
    webhook_events: List[str] = Field(default_factory=list)
    webhook_secret: Optional[str] = None


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    billing_cycles: Optional[List[str]] = None
    webhook_url: Optional[str] = None
    webhook_events: Optional[List[str]] = None
    webhook_secret: Optional[str] = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: Optional[str] = None
    price: Optional[float] = None
    currency: str
    status: str
    billing_cycles: List[str] = Field(default_factory=list)
    webhook_url: Optional[str] = None
    webhook_events: List[str] = Field(default_factory=list)
    webhook_secret: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# --- Webhooks (v2.0) --------------------------------------------------------


class WebhookDeliveryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: Optional[int] = None
    event: str
    url: str
    status_code: Optional[int] = None
    success: bool
    response_body: Optional[str] = None
    created_at: datetime


class TestWebhookResponse(BaseModel):
    success: bool
    status_code: Optional[int] = None


# --- Custom languages (v2.0) ------------------------------------------------


class CustomLanguageListItem(BaseModel):
    code: str
    name: str


class CustomLanguageUpsertRequest(BaseModel):
    name: str
    translations: dict = Field(default_factory=dict)


class CustomLanguageResponse(BaseModel):
    code: str
    name: str
    translations: dict = Field(default_factory=dict)


# --- Licenses ---------------------------------------------------------------

def _split_lock_list(value):
    """Accept a comma-separated string or a list for lock fields.

    The frontend sends lock fields as comma-separated strings; the API
    also accepts a JSON list. Normalise both to a list of strings.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return value


class LicenseCreateRequest(BaseModel):
    key: Optional[str] = Field(
        default=None, description="License key; generated server-side when omitted"
    )
    product: Optional[str] = Field(
        default=None,
        description="Legacy product name; filled from the product when product_id is given",
    )
    product_id: Optional[int] = None
    billing_cycle: Optional[str] = Field(
        default=None,
        description="Required with product_id; one of the product's cycles",
    )
    allowed_domains: Optional[List[str]] = None
    allowed_ips: Optional[List[str]] = None
    install_path: Optional[str] = None
    owner_email: Optional[EmailStr] = None
    status: str = Field(default="active", description="active / inactive / revoked")
    expires_in_days: Optional[int] = Field(default=None, description="Days until expiry")
    max_activations: int = Field(default=1, ge=1)

    @field_validator("allowed_domains", "allowed_ips", mode="before")
    @classmethod
    def _split_lock_fields(cls, value):
        return _split_lock_list(value)


class LicenseUpdateRequest(BaseModel):
    product: Optional[str] = None
    product_id: Optional[int] = None
    billing_cycle: Optional[str] = None
    allowed_domains: Optional[List[str]] = None
    allowed_ips: Optional[List[str]] = None
    install_path: Optional[str] = None
    owner_email: Optional[EmailStr] = None
    status: Optional[str] = None
    expires_in_days: Optional[int] = None
    max_activations: Optional[int] = Field(default=None, ge=1)

    @field_validator("allowed_domains", "allowed_ips", mode="before")
    @classmethod
    def _split_lock_fields(cls, value):
        return _split_lock_list(value)


class LicenseRenewRequest(BaseModel):
    extend_days: Optional[int] = Field(
        default=None,
        gt=0,
        description="Days to extend by; when omitted the license's billing_cycle decides",
    )


class LicenseValidateRequest(BaseModel):
    key: str
    domain: Optional[str] = None
    ip: Optional[str] = None
    install_path: Optional[str] = None


class LicenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    product: str
    product_id: Optional[int] = None
    billing_cycle: Optional[str] = None
    allowed_domains: List[str] = Field(default_factory=list)
    allowed_ips: List[str] = Field(default_factory=list)
    install_path: Optional[str] = None
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
