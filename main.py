from fastapi import FastAPI
from database import create_tables
from routers import api_keys, admin_settings
import logging

# تنظیمات لاگ
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# ایجاد اپلیکیشن FastAPI
app = FastAPI(
    title="API Key Management System",
    description="A FastAPI project for managing API keys with access controls and usage logs.",
    version="1.0.0"
)

# ثبت روترها
app.include_router(api_keys.router, prefix="/api/v1", tags=["API Keys"])
app.include_router(admin_settings.router, prefix="/api/v1/admin", tags=["Admin Settings"])


# ایجاد جداول پایگاه داده در زمان شروع برنامه
@app.on_event("startup")
def startup_event():
    logging.info("Starting up the application...")
    create_tables()
    logging.info("Database tables are initialized.")


# رویدادهای خاموش شدن برنامه
@app.on_event("shutdown")
def shutdown_event():
    logging.info("Shutting down the application...")


# مسیر پیش‌فرض برای تست سلامت سرور
@app.get("/", tags=["Health Check"])
def health_check():
    """
    مسیر بررسی سلامت سرور.
    """
    return {"message": "API is running successfully!"}