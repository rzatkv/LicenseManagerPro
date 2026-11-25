"""Pydantic v2 request/response schemas."""
import json
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# --- Auth -------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # v2.3: when the user has TOTP enabled, login returns no JWT yet —
    # instead requires_2fa=true and a short-lived temp_token to exchange
    # for a JWT at POST /api/auth/verify-2fa.
    requires_2fa: bool = False
    temp_token: str | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="At least 8 characters")
    role: str = Field(default="admin", description="admin, manager, support or viewer")


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: str = Field(default="viewer", description="admin, manager, support or viewer")
    # v2.3: link to a custom role row instead of a legacy role name.
    role_id: int | None = None


class UserUpdateRequest(BaseModel):
    role: str | None = None
    role_id: int | None = None
    is_active: bool | None = None
    # v2.3 profile fields.
    display_name: str | None = None
    avatar_url: str | None = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: str
    role_id: int | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    totp_enabled: bool = False
    last_login_at: datetime | None = None
    is_active: bool
    created_at: datetime


# --- API keys ---------------------------------------------------------------

class AccessResponse(BaseModel):
    access_rights: list[str]


class AddApiKeyRequest(BaseModel):
    key: str | None = Field(
        default=None,
        min_length=10,
        max_length=255,
        description="API key value; generated server-side when omitted",
    )
    access_rights: list[str] | None = Field(
        default=None,
        description="List of access rights (defaults to the module preset for module keys)",
    )
    # v2.3 scopes: [] = legacy key; ["module"] = module preset.
    scopes: list[str] = Field(default_factory=list)
    # v2.3: when true, calls with this key must be HMAC-signed.
    require_signed_requests: bool = False
    expires_in_days: int | None = Field(default=None, description="Days until expiry")
    associated_ip: str | None = None
    associated_domain: str | None = None
    associated_directory: str | None = None
    single_use: bool = False


class UpdateApiKeyRequest(BaseModel):
    access_rights: list[str] | None = None
    scopes: list[str] | None = None
    require_signed_requests: bool | None = None
    expires_in_days: int | None = None
    associated_ip: str | None = None
    associated_domain: str | None = None
    associated_directory: str | None = None
    single_use: bool | None = None


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # v2.3: the display PREFIX only (e.g. "lmp_a1b2c3d4") — never the
    # secret. The full secret is returned once, at creation/rotation,
    # in `plain_key`.
    key: str
    access_rights: list[str]
    scopes: list[str] = Field(default_factory=list)
    require_signed_requests: bool = False
    plain_key: str | None = Field(
        default=None, description="Full secret, present only on create/rotate"
    )
    expires_at: datetime | None = None
    associated_ip: str | None = None
    associated_domain: str | None = None
    associated_directory: str | None = None
    single_use: bool
    consumed: bool = False
    created_at: datetime | None = None

    @field_validator("access_rights", mode="before")
    @classmethod
    def _split_rights(cls, value):
        # Stored as a comma-separated string in the database.
        if isinstance(value, str):
            return [part for part in value.split(",") if part]
        return value

    @field_validator("scopes", mode="before")
    @classmethod
    def _parse_scopes(cls, value):
        # Stored as a JSON list in the database.
        if isinstance(value, str):
            import json

            try:
                parsed = json.loads(value or "[]")
            except ValueError:
                return []
            return parsed if isinstance(parsed, list) else []
        return value


class ApiKeyListResponse(BaseModel):
    total: int
    api_keys: list[ApiKeyResponse]


# --- Product groups (v2.2) ------------------------------------------------


class ProductGroupCreateRequest(BaseModel):
    name: str
    slug: str | None = None
    description: str | None = None
    color: str = "#7B6CFF"
    sort_order: int = 0


class ProductGroupUpdateRequest(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    color: str | None = None
    sort_order: int | None = None


class ProductGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None = None
    color: str
    sort_order: int
    created_at: datetime
    updated_at: datetime


# --- Blacklist (v2.2) -----------------------------------------------------


class BlacklistCreateRequest(BaseModel):
    type: str = Field(..., description="ip or domain")
    value: str
    reason: str | None = None


class BlacklistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    value: str
    reason: str | None = None
    created_by: str | None = None
    created_at: datetime


# --- Notifications (v2.2) -------------------------------------------------


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None = None
    title: str
    message: str
    type: str
    link: str | None = None
    is_read: bool
    created_at: datetime


class NotificationsListResponse(BaseModel):
    total: int
    unread: int
    notifications: list[NotificationResponse]


# --- License activations + reissue (v2.2) ---------------------------------


class LicenseActivationCreateRequest(BaseModel):
    fingerprint: str = Field(..., description="Machine/install fingerprint (domain, IP or install path)")
    label: str | None = None


class LicenseActivationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    license_id: int
    fingerprint: str
    label: str | None = None
    created_at: datetime


# --- Products (v2.0) ------------------------------------------------------

BILLING_CYCLES = ["monthly", "quarterly", "semiannual", "annual", "biennial", "lifetime"]


class ProductCreateRequest(BaseModel):
    name: str
    slug: str | None = None
    description: str | None = None
    price: float | None = None
    currency: str = "USD"
    status: str = "active"
    billing_cycles: list[str] = Field(..., description="Non-empty subset of the six cycles")
    webhook_url: str | None = None
    webhook_events: list[str] = Field(default_factory=list)
    webhook_secret: str | None = None
    group_id: int | None = None
    key_prefix: str | None = None
    key_segments: int = Field(default=4, ge=1, le=8)
    key_segment_length: int = Field(default=4, ge=2, le=8)
    max_reissues: int | None = Field(default=None, ge=0)
    # v2.3: per-product license-security overrides (same keys as the
    # global LicenseSecurityConfig); keys present here override global.
    security_overrides: dict | None = None


class ProductUpdateRequest(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    price: float | None = None
    currency: str | None = None
    status: str | None = None
    billing_cycles: list[str] | None = None
    webhook_url: str | None = None
    webhook_events: list[str] | None = None
    webhook_secret: str | None = None
    group_id: int | None = None
    key_prefix: str | None = None
    key_segments: int | None = Field(default=None, ge=1, le=8)
    key_segment_length: int | None = Field(default=None, ge=2, le=8)
    max_reissues: int | None = Field(default=None, ge=0)
    security_overrides: dict | None = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None = None
    price: float | None = None
    currency: str
    status: str
    billing_cycles: list[str] = Field(default_factory=list)
    webhook_url: str | None = None
    webhook_events: list[str] = Field(default_factory=list)
    webhook_secret: str | None = None
    group_id: int | None = None
    key_prefix: str | None = None
    key_segments: int = 4
    key_segment_length: int = 4
    max_reissues: int | None = None
    security_overrides: dict | None = None
    created_at: datetime
    updated_at: datetime


# --- Webhooks (v2.0) --------------------------------------------------------


class WebhookDeliveryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int | None = None
    event: str
    url: str
    status_code: int | None = None
    success: bool
    response_body: str | None = None
    created_at: datetime


class TestWebhookResponse(BaseModel):
    success: bool
    status_code: int | None = None


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
    key: str | None = Field(
        default=None, description="License key; generated server-side when omitted"
    )
    product: str | None = Field(
        default=None,
        description="Legacy product name; filled from the product when product_id is given",
    )
    product_id: int | None = None
    billing_cycle: str | None = Field(
        default=None,
        description="Required with product_id; one of the product's cycles",
    )
    allowed_domains: list[str] | None = None
    allowed_ips: list[str] | None = None
    install_path: str | None = None
    owner_email: EmailStr | None = None
    status: str = Field(default="active", description="active / inactive / revoked")
    expires_in_days: int | None = Field(default=None, description="Days until expiry")
    max_activations: int = Field(default=1, ge=1)

    @field_validator("allowed_domains", "allowed_ips", mode="before")
    @classmethod
    def _split_lock_fields(cls, value):
        return _split_lock_list(value)


class LicenseUpdateRequest(BaseModel):
    product: str | None = None
    product_id: int | None = None
    billing_cycle: str | None = None
    allowed_domains: list[str] | None = None
    allowed_ips: list[str] | None = None
    install_path: str | None = None
    owner_email: EmailStr | None = None
    status: str | None = None
    expires_in_days: int | None = None
    max_activations: int | None = Field(default=None, ge=1)

    @field_validator("allowed_domains", "allowed_ips", mode="before")
    @classmethod
    def _split_lock_fields(cls, value):
        return _split_lock_list(value)


class LicenseRenewRequest(BaseModel):
    extend_days: int | None = Field(
        default=None,
        gt=0,
        description="Days to extend by; when omitted the license's billing_cycle decides",
    )


class LicenseValidateRequest(BaseModel):
    key: str
    domain: str | None = None
    ip: str | None = None
    install_path: str | None = None


class LicenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    product: str
    product_id: int | None = None
    billing_cycle: str | None = None
    allowed_domains: list[str] = Field(default_factory=list)
    allowed_ips: list[str] = Field(default_factory=list)
    install_path: str | None = None
    owner_email: str | None = None
    status: str  # effective status (expired is derived on read)
    expires_at: datetime | None = None
    max_activations: int
    activations: int
    reissue_count: int = 0
    created_at: datetime
    updated_at: datetime


class LicenseValidateResponse(BaseModel):
    valid: bool
    detail: str
    license: LicenseResponse | None = None
    # v2.3 lenient mode: valid but with a grace warning (e.g. a lock
    # mismatch that was allowed through in lenient mode).
    grace: bool = False
    warnings: list[str] = Field(default_factory=list)


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
    estimated_mrr: float = 0.0


class DashboardTrendPoint(BaseModel):
    date: str
    count: int


class DashboardTrendResponse(BaseModel):
    days: int
    points: list[DashboardTrendPoint]


class SystemInfoResponse(BaseModel):
    version: str
    lastUpdated: str


class CheckUpdatesResponse(BaseModel):
    updateAvailable: bool
    currentVersion: str
    latestVersion: str


class UpdateCheckResponse(BaseModel):
    """Live GitHub release check (v2.2)."""

    current_version: str
    latest_version: str | None = None
    update_available: bool = False
    release_url: str | None = None
    release_notes: str | None = None
    published_at: str | None = None
    error: str | None = None


class StageUpdateResponse(BaseModel):
    """Result of staging a release tarball (v2.2)."""

    staged: bool
    version: str | None = None
    file: str | None = None
    next_step: str
    auto_applied: bool = False


class DownloadItemResponse(BaseModel):
    """One downloadable integration module (v2.3)."""

    id: str
    name: str
    version: str
    description: str
    download_url: str
    zip_url: str | None = None


class ModuleVersionsResponse(BaseModel):
    """Local vs latest (GitHub manifest) module versions (v2.3).

    One key per module id; the two v2.2 fields stay declared for backward
    compatibility, the rest arrive via extra="allow".
    """

    model_config = ConfigDict(extra="allow")

    whmcs: dict = Field(default_factory=dict)
    woocommerce: dict = Field(default_factory=dict)


class MessageResponse(BaseModel):
    message: str


# --- Audit log (v2.1) -------------------------------------------------------


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_email: str
    action: str
    entity: str
    entity_id: str | None = None
    details: dict | None = None
    created_at: datetime

    @field_validator("details", mode="before")
    @classmethod
    def _parse_details(cls, value):
        # Stored as a JSON string in the database (or NULL).
        if isinstance(value, str):
            try:
                return json.loads(value)
            except ValueError:
                return None
        return value


# --- Roles (v2.3) -----------------------------------------------------------

class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str | None = None
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)


class RoleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    permissions: list[str] | None = None


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)
    is_builtin: bool = False
    users_count: int = 0
    created_at: datetime
    updated_at: datetime


# --- Two-factor authentication (v2.3) --------------------------------------

class TwoFASetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    qr_data_url: str


class TwoFAVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=8)


class TwoFADisableRequest(BaseModel):
    password: str
    code: str = Field(..., min_length=6, max_length=8)


class TwoFAStatusResponse(BaseModel):
    enabled: bool
    backup_codes_remaining: int = 0


class TwoFALoginRequest(BaseModel):
    temp_token: str
    code: str = Field(..., min_length=6, max_length=8)


class TwoFABackupCodesResponse(BaseModel):
    backup_codes: list[str]


# --- License security (v2.3) ------------------------------------------------

class LicenseSecurityConfig(BaseModel):
    strictness: str = Field(default="strict", description="strict | lenient")
    enforce_domain_lock: bool = True
    enforce_ip_lock: bool = True
    enforce_install_path_lock: bool = True
    enforce_activation_limit: bool = True
    missing_lock_behavior: str = Field(
        default="deny", description="deny | allow"
    )


class LicenseSecurityUpdateRequest(BaseModel):
    """Partial update: only the keys sent are changed; the rest keep
    their stored values. Invalid values are ignored (never open a hole)."""

    strictness: str | None = None
    enforce_domain_lock: bool | None = None
    enforce_ip_lock: bool | None = None
    enforce_install_path_lock: bool | None = None
    enforce_activation_limit: bool | None = None
    missing_lock_behavior: str | None = None


# --- Global search (v2.3) ---------------------------------------------------

class SearchResultItem(BaseModel):
    type: str  # license | product | user
    id: int
    title: str
    subtitle: str | None = None
    link: str


class SearchResponse(BaseModel):
    licenses: list[SearchResultItem] = Field(default_factory=list)
    products: list[SearchResultItem] = Field(default_factory=list)
    users: list[SearchResultItem] = Field(default_factory=list)


# --- Per-user preferences (v2.3) --------------------------------------------

class UserPreferencesPutRequest(BaseModel):
    key: str = Field(..., min_length=1, max_length=100)
    value: dict = Field(default_factory=dict)


class UserPreferencesResponse(BaseModel):
    preferences: dict = Field(default_factory=dict)


# --- Dashboard extras (v2.3) ------------------------------------------------

class WebhookStatsResponse(BaseModel):
    total: int = 0
    success: int = 0
    failed: int = 0
    success_rate: float = 0.0
    by_event: dict = Field(default_factory=dict)
