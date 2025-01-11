from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging

# تنظیمات پایگاه داده
DATABASE_URL = "mysql+pymysql://username:password@localhost/dbname"

# پیکربندی SQLAlchemy
Base = declarative_base()
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # بررسی اتصال‌های قطع‌شده
    pool_size=10,  # تعداد اتصال‌های همزمان در Pool
    max_overflow=20  # حداکثر تعداد اتصال‌های اضافی
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# مدیریت اتصال پایگاه داده
def get_db():
    """
    Dependency: باز کردن یک نشست پایگاه داده و مدیریت آن.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logging.error(f"Database error: {e}")
        raise
    finally:
        db.close()


# ایجاد جداول پایگاه داده
def create_tables():
    """
    ایجاد جداول پایگاه داده با استفاده از مدل‌های تعریف‌شده.
    """
    try:
        from models import ApiKey, ApiUsageLog, SystemSetting
        Base.metadata.create_all(bind=engine)
        logging.info("Tables created successfully.")
    except Exception as e:
        logging.error(f"Error creating tables: {e}")
        raise


# حذف جداول پایگاه داده (اختیاری)
def drop_tables():
    """
    حذف تمام جداول پایگاه داده (برای عملیات ریست کردن).
    """
    try:
        from models import ApiKey, ApiUsageLog, SystemSetting
        Base.metadata.drop_all(bind=engine)
        logging.info("Tables dropped successfully.")
    except Exception as e:
        logging.error(f"Error dropping tables: {e}")
        raise
