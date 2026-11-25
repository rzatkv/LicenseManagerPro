"""SQLAlchemy 2.x models."""
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base, utcnow


def _utcnow():
    return utcnow()


class User(Base):
    """Application user (admin panel login)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="user", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class Product(Base):
    """A sellable product; licenses link to it (v2.0)."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="active", nullable=False
    )  # active / inactive
    # JSON lists stored as text: e.g. ["monthly", "annual"].
    billing_cycles: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    webhook_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    webhook_events: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Product group (v2.2); NULL means "ungrouped".
    group_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("product_groups.id", ondelete="SET NULL"), nullable=True
    )
    # Per-product key generator (v2.2, from competitor research): keys are
    # "<prefix>-XXXX-XXXX-..." with key_segments chunks of
    # key_segment_length chars. Empty prefix keeps the legacy "XXXX-..." form.
    key_prefix: Mapped[str | None] = mapped_column(String(50), nullable=True)
    key_segments: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    key_segment_length: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    # Max times a license of this product may be reissued (v2.2); NULL = unlimited.
    max_reissues: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    licenses: Mapped[list["License"]] = relationship(
        "License", back_populates="product_obj"
    )
    webhook_deliveries: Mapped[list["WebhookDelivery"]] = relationship(
        "WebhookDelivery", back_populates="product"
    )
    group: Mapped["ProductGroup | None"] = relationship(
        "ProductGroup", back_populates="products"
    )


class ProductGroup(Base):
    """A group of products (v2.2), e.g. "Hosting", "SaaS tools"."""

    __tablename__ = "product_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(10), default="#7B6CFF", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    products: Mapped[list["Product"]] = relationship(
        "Product", back_populates="group"
    )


class BlacklistEntry(Base):
    """A blocked IP (exact or CIDR) or domain (exact or subdomain) (v2.2).

    Blacklisted values can never validate a license or pass an API-key
    check, whatever else they present.
    """

    __tablename__ = "blacklist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # "ip" | "domain"
    value: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class Notification(Base):
    """An in-app notification (v2.2).

    user_id NULL means "all admins"; otherwise the notification belongs to
    one user. The bell in the topbar shows unread notifications.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(
        String(20), default="info", nullable=False
    )  # info / success / warning / error
    link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class LicenseActivation(Base):
    """One activation instance of a license (v2.2, Keygen-style).

    A fingerprint identifies one machine/install (domain, IP or install
    path, whichever the client sends). Deactivating one instance frees one
    activation slot without touching the others.
    """

    __tablename__ = "license_activations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    license_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fingerprint: Mapped[str] = mapped_column(String(512), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class WebhookDelivery(Base):
    """One recorded attempt to POST a webhook event to a product URL."""

    __tablename__ = "webhook_deliveries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    event: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    product: Mapped[Product | None] = relationship(
        "Product", back_populates="webhook_deliveries"
    )


class CustomLanguage(Base):
    """A user-added language (code + full translation map).

    Built-in languages (en/fa) live in the frontend, not in this table.
    """

    __tablename__ = "custom_languages"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # JSON object stored as text: {key: value, ...}.
    translations: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


class ApiKey(Base):
    """API key with access rights and optional restrictions."""

    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    access_rights: Mapped[str] = mapped_column(Text, nullable=False)  # comma-separated
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    associated_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    associated_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    associated_directory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # True when the key is single-use; consumed is set on first successful use.
    single_use: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    usage_logs: Mapped[list["ApiUsageLog"]] = relationship(
        "ApiUsageLog", back_populates="api_key", cascade="all, delete-orphan"
    )


class ApiUsageLog(Base):
    """Per-day request counter for one API key (date, not datetime)."""

    __tablename__ = "api_usage_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    api_key_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    request_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    api_key: Mapped[ApiKey] = relationship("ApiKey", back_populates="usage_logs")


class License(Base):
    """A software license issued to a customer."""

    __tablename__ = "licenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Legacy free-text product name, kept for backward compatibility; filled
    # from the linked product's name when product_id is given.
    product: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    billing_cycle: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Comma-separated lock lists; empty/None means "no restriction".
    allowed_domains: Mapped[str | None] = mapped_column(Text, nullable=True)
    allowed_ips: Mapped[str | None] = mapped_column(Text, nullable=True)
    install_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Stored status: active / inactive / revoked. "expired" is derived on read
    # when expires_at is in the past.
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    max_activations: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    activations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Times this license has been reissued (v2.2).
    reissue_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    product_obj: Mapped[Product | None] = relationship(
        "Product", back_populates="licenses"
    )
    activation_records: Mapped[list["LicenseActivation"]] = relationship(
        "LicenseActivation", cascade="all, delete-orphan"
    )

    @property
    def effective_status(self) -> str:
        """Status as the outside world sees it (expired is derived)."""
        if self.status == "active" and self.expires_at and self.expires_at < utcnow():
            return "expired"
        return self.status


class SystemSetting(Base):
    """A single key/value system setting."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class AuditLog(Base):
    """One recorded admin action (who did what, to which entity, when)."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    entity: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    entity_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # JSON object stored as text, or NULL.
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
