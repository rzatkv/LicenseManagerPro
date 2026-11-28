"""Application configuration, read from environment variables.

Copy backend/.env.example to backend/.env and adjust the values.
No real secrets are shipped in this repository.
"""
import os

from dotenv import load_dotenv

load_dotenv()

# Database: SQLite by default so the app runs out of the box.
# For MySQL use e.g. mysql+pymysql://user:password@localhost:3306/license_manager
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./license_manager.db")

# JWT secret. MUST be changed in production (see .env.example).
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Fallback daily request limit for API-key validation (can be overridden
# per deployment by the "daily_request_limit" system setting).
DAILY_REQUEST_LIMIT = int(os.getenv("DAILY_REQUEST_LIMIT", "100"))

# Comma-separated list of origins allowed to call the API (the React dev
# server runs on http://localhost:3000).
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

# Current application version, shown by GET /api/system/info.
APP_VERSION = os.getenv("APP_VERSION", "3.0.11")

# GitHub repo used by the self-update check (GET /api/system/update-check)
# and the module version manifest (GET /api/downloads/versions).
GITHUB_REPO = os.getenv("GITHUB_REPO", "rzatkv/LicenseManagerPro")

# GitHub API hosts (overridable for tests: point them at a local stub
# server so the smoke test never touches the real GitHub API).
GITHUB_API_BASE_URL = os.getenv("GITHUB_API_BASE_URL", "https://api.github.com")
GITHUB_RAW_BASE_URL = os.getenv("GITHUB_RAW_BASE_URL", "https://raw.githubusercontent.com")

# Self-update safety switch: the backend stages a release tarball on
# POST /api/system/update, but only EXECUTES scripts/update.sh when this
# is "1". Default off: the admin applies the staged update manually.
LMP_ALLOW_SELF_UPDATE = os.getenv("LMP_ALLOW_SELF_UPDATE", "0") == "1"

# Rate limits (requests per minute, per client IP) for the hand-rolled
# sliding-window limiter in utils/rate_limit.py.
RATE_LIMIT_AUTH_PER_MINUTE = int(os.getenv("RATE_LIMIT_AUTH_PER_MINUTE", "10"))
RATE_LIMIT_VALIDATE_PER_MINUTE = int(os.getenv("RATE_LIMIT_VALIDATE_PER_MINUTE", "60"))
RATE_LIMIT_2FA_PER_MINUTE = int(os.getenv("RATE_LIMIT_2FA_PER_MINUTE", "5"))
RATE_LIMIT_CAPTCHA_PER_MINUTE = int(os.getenv("RATE_LIMIT_CAPTCHA_PER_MINUTE", "10"))

# --- Optional SMTP settings for utils.email.send_email -------------------
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
