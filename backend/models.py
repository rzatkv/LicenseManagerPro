"""SQLAlchemy 2.x models."""
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
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
    product: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Stored status: active / inactive / revoked. "expired" is derived on read
    # when expires_at is in the past.
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    max_activations: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    activations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
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
