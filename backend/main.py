"""LicenseManagerPro API — FastAPI backend.

All routes live under /api (see README.md for the endpoint table).
"""
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from config import APP_VERSION, CORS_ORIGINS, SECRET_KEY
from database import SessionLocal, create_tables, ensure_schema, seed_settings
from models import User
from routers import (
    api_keys,
    audit_logs,
    auth,
    blacklist,
    dashboard,
    downloads,
    languages,
    licenses,
    notifications,
    product_groups,
    products,
    settings,
    system,
    users,
    webhooks,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
# Per-request access log ("lmp"): method, path, status, duration.
request_logger = logging.getLogger("lmp")

# The SECRET_KEY shipped in config.py as the default; running with it in
# production would let anyone forge JWTs.
DEFAULT_SECRET_KEY = "change-me-in-production"

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}
# Conservative CSP for API responses only; never on /docs (Swagger UI
# needs its own inline scripts/styles).
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up the application...")
    if SECRET_KEY == DEFAULT_SECRET_KEY:
        logger.warning(
            "SECRET_KEY is still the shipped default (%s). "
            "Set a long random SECRET_KEY in .env before using this "
            "in production — anyone who knows the default can forge JWTs.",
            DEFAULT_SECRET_KEY,
        )
    create_tables()
    ensure_schema()
    db = SessionLocal()
    try:
        seed_settings(db)
        if db.query(User).count() == 0:
            logger.info(
                "No users exist yet. Create the first admin with: "
                "POST /api/auth/register {\"email\": ..., \"password\": ...} "
                "(no token needed for this first user only)."
            )
    finally:
        db.close()
    logger.info("Database tables are initialized.")
    yield
    logger.info("Shutting down the application...")


app = FastAPI(
    title="License Manager Pro",
    description="Manage API keys, licenses, users and system settings.",
    version=APP_VERSION,
    lifespan=lifespan,
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Set security headers on every response; CSP only for /api/*."""
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers[name] = value
    if request.url.path.startswith("/api/"):
        response.headers["Content-Security-Policy"] = API_CSP
    return response


@app.middleware("http")
async def request_id_logging_middleware(request: Request, call_next):
    """Assign an X-Request-ID to every response and log one line per request."""
    request_id = uuid.uuid4().hex
    started = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - started) * 1000
    response.headers["X-Request-ID"] = request_id
    request_logger.info(
        "%s %s %s %.1fms request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All routes are mounted under /api to match the frontend and README.
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(api_keys.router, prefix="/api/api-keys", tags=["API Keys"])
app.include_router(licenses.router, prefix="/api/licenses", tags=["Licenses"])
app.include_router(products.router, prefix="/api/products", tags=["Products"])
app.include_router(product_groups.router, prefix="/api/product-groups", tags=["Product Groups"])
app.include_router(blacklist.router, prefix="/api/blacklist", tags=["Blacklist"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(downloads.router, prefix="/api/downloads", tags=["Downloads"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(languages.router, prefix="/api/languages", tags=["Languages"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(system.router, prefix="/api/system", tags=["System"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["Audit Logs"])


@app.get("/", tags=["Health Check"])
def health_check():
    """Health check."""
    return {"message": "API is running successfully!"}
