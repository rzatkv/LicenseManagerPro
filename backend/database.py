"""Database setup (SQLAlchemy 2.x style).

The database URL comes from the DATABASE_URL environment variable and
defaults to a local SQLite file so the app runs out of the box. Point it at
a MySQL URL (mysql+pymysql://...) to use MySQL instead.
"""
import logging
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from config import DATABASE_URL

logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    """Naive UTC now (datetimes are stored naive in the database)."""
    return datetime.now(UTC).replace(tzinfo=None)


def escape_like(value: str) -> str:
    """Escape a user-supplied term for a SQL LIKE pattern.

    SQLAlchemy parameterises the value (no SQL injection), but ``%``
    and ``_`` in the input would still act as wildcards — a search for
    "%" would match every row. Escape them (and the escape char itself)
    and always pair with ``.like(pattern, escape="\\\\")``.
    """
    return (
        (value or "")
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


class Base(DeclarativeBase):
    pass


def _create_engine(url: str):
    if url.startswith("sqlite"):
        return create_engine(
            url, connect_args={"check_same_thread": False}, pool_pre_ping=True
        )
    return create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=20)


engine = _create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency: open a database session and close it afterwards."""
    db = SessionLocal()
    try:
        yield db
    except HTTPException:
        # Normal API errors (401/403/404/...) are not database errors:
        # re-raise them without logging noise.
        raise
    except Exception as e:
        db.rollback()
        logger.error("Database error: %s", e)
        raise
    finally:
        db.close()


def create_tables():
    """Create all tables (imports models so they are registered first)."""
    import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    logger.info("Tables created successfully.")


def ensure_schema():
    """Bring pre-v2.0 databases up to the current models (no Alembic).

    After create_all, inspect every mapped table and ADD COLUMN for any
    mapped column missing from the real table. New tables are already
    created by create_all, so only missing columns are handled here. Column
    types are rendered through the dialect's type compiler, and new columns
    are all nullable/simple types (String/Text/Integer/Float/Boolean/
    DateTime) so the DDL works on both SQLite and MySQL.
    """
    import models  # noqa: F401

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    preparer = engine.dialect.identifier_preparer
    with engine.begin() as conn:
        for table in Base.metadata.tables.values():
            if table.name not in existing_tables:
                continue  # create_all already created it
            existing_cols = {
                col["name"] for col in inspector.get_columns(table.name)
            }
            for column in table.columns:
                if column.name in existing_cols:
                    continue
                coltype = column.type.compile(dialect=engine.dialect)
                ddl = (
                    f"ALTER TABLE {preparer.quote(table.name)} "
                    f"ADD COLUMN {preparer.quote(column.name)} {coltype}"
                )
                if not column.nullable:
                    default = (
                        column.default.arg
                        if column.default is not None and column.default.arg is not None
                        else None
                    )
                    if default is None:
                        # A NOT NULL column with no default cannot be added
                        # to a populated table; add it nullable instead and
                        # let the application enforce the constraint.
                        logger.warning(
                            "Adding column %s.%s as nullable (mapped NOT NULL, no default)",
                            table.name,
                            column.name,
                        )
                    else:
                        ddl += f" DEFAULT {default!r}"
                logger.info("Schema migration: %s", ddl)
                conn.execute(text(ddl)
                )

        # Retired columns (v3.0.0): two product columns were removed —
        # this is not a financial system. Drop them from pre-v3.0.0
        # databases when present; a failure is logged, never fatal.
        retired = {"products": ("price", "currency")}
        for table_name, columns in retired.items():
            if table_name not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table_name)}
            for column_name in columns:
                if column_name not in present:
                    continue
                drop_ddl = (
                    f"ALTER TABLE {preparer.quote(table_name)} "
                    f"DROP COLUMN {preparer.quote(column_name)}"
                )
                try:
                    conn.execute(text(drop_ddl))
                    logger.info("Schema migration: %s", drop_ddl)
                except Exception as e:  # noqa: BLE001 - old engines may lack DROP COLUMN
                    logger.warning(
                        "Could not drop retired column %s.%s: %s",
                        table_name, column_name, e,
                    )


def seed_settings(db):
    """Seed the system settings the app depends on, if they are missing."""
    from datetime import date

    from config import APP_VERSION, DAILY_REQUEST_LIMIT
    from models import SystemSetting

    defaults = {
        "app_version": APP_VERSION,
        "latest_version": APP_VERSION,
        "last_updated": date.today().isoformat(),
        "daily_request_limit": str(DAILY_REQUEST_LIMIT),
        # Branding (v2.2): the site name and logo shown in the sidebar and
        # on the login page; both are editable from Settings.
        "site_name": "License Manager Pro",
        "logo_url": "./logo.svg",
        # License security defaults (v2.3): strict validation, all locks
        # enforced, missing lock data denies. See services/license_security.
        "license_security": (
            '{"strictness": "strict", "enforce_domain_lock": true, '
            '"enforce_ip_lock": true, "enforce_install_path_lock": true, '
            '"enforce_activation_limit": true, "missing_lock_behavior": "deny"}'
        ),
        # Panel domain (v3.0): the admin-configured domain the panel runs
        # on; empty means "use the request host". Editable in Settings.
        "panel_domain": "",
        # Maintenance mode (v3.0): off by default; the message is shown to
        # visitors while maintenance is on (empty = the frontend default).
        "maintenance_mode": "off",
        "maintenance_message": "",
        # Date calendar (v3.0): gregorian | jalali | hijri.
        "date_calendar": "gregorian",
        # Auto-strip 4-byte characters (v3.0): on by default — MySQL
        # utf8 cannot store emoji; off keeps input untouched.
        "strip_4byte": "on",
        # 2FA delivery channel (v3.0): totp | email | sms.
        "twofa_channel": "totp",
        # System encoding (v3.0): response charset; utf-8 default. This
        # NEVER changes the database charset or stored data.
        "system_encoding": "utf-8",
        # Product & license notes (v3.0): on by default.
        "product_notes_enabled": "on",
        # JSON configs (v3.0) — written by their dedicated endpoints.
        "sms_config": '{"active_provider": "", "providers": {"ippanel": {}, "kavenegar": {}, "faraz": {}}}',
        "email_config": "{}",
        "telegram_config": '{"bot_token": "", "chat_ids": []}',
        "notification_channels": "{}",
    }
    for key, value in defaults.items():
        existing = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if existing is None:
            db.add(SystemSetting(key=key, value=value))
    db.commit()


def seed_roles(db):
    """Seed the four built-in roles (v2.3) if they are missing.

    v3.0.4: existing installs keep their stored builtin rows, so the
    permissions added in this version are MERGED into those rows
    (added only, never removed — an admin's deliberate removal of an
    old permission is untouched).
    """
    import json

    from models import Role
    from utils.permissions import ROLE_PERMISSIONS, ROLE_PERMISSION_ADDITIONS_V304

    for slug, perms in ROLE_PERMISSIONS.items():
        if slug == "user":
            continue  # legacy alias, not a real role
        existing = db.query(Role).filter(Role.slug == slug).first()
        if existing is None:
            db.add(
                Role(
                    name=slug.capitalize(),
                    slug=slug,
                    description=None,
                    permissions=json.dumps(sorted(perms)),
                    is_builtin=True,
                )
            )
        else:
            additions = ROLE_PERMISSION_ADDITIONS_V304.get(slug)
            if additions:
                try:
                    stored = set(json.loads(existing.permissions or "[]"))
                except (ValueError, TypeError):
                    stored = set()
                if not additions.issubset(stored):
                    stored |= set(additions)
                    existing.permissions = json.dumps(sorted(stored))
    db.commit()
