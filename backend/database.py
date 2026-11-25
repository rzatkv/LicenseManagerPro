"""Database setup (SQLAlchemy 2.x style).

The database URL comes from the DATABASE_URL environment variable and
defaults to a local SQLite file so the app runs out of the box. Point it at
a MySQL URL (mysql+pymysql://...) to use MySQL instead.
"""
import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from config import DATABASE_URL

logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    """Naive UTC now (datetimes are stored naive in the database)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


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
    }
    for key, value in defaults.items():
        existing = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if existing is None:
            db.add(SystemSetting(key=key, value=value))
    db.commit()
