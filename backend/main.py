"""LicenseManagerPro API — FastAPI backend.

All routes live under /api (see README.md for the endpoint table).
"""
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import APP_VERSION, CORS_ORIGINS, SECRET_KEY
from database import SessionLocal, create_tables, ensure_schema, seed_roles, seed_settings
from models import User
from services.settings import get_setting_default
from services.strip4 import strip_4byte_deep
from utils.auth import verify_access_token
from routers import (
    api_keys,
    audit_logs,
    auth,
    blacklist,
    captcha,
    dashboard,
    downloads,
    languages,
    licenses,
    news,
    notifications,
    product_groups,
    products,
    roles,
    search,
    settings,
    sms,
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
        seed_roles(db)
        # v2.3: hash any pre-v2.3 plaintext API keys (one-time migration).
        from services import api_keys as api_key_service

        migrated = api_key_service.migrate_api_key_hashes(db)
        if migrated:
            logger.info("Migrated %d API key(s) to hashed storage.", migrated)
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
        # v3.0: the response charset follows the `system_encoding`
        # setting (read by the maintenance middleware into request.state;
        # utf-8 when unset). This never touches the database charset.
        encoding = getattr(request.state, "system_encoding", "utf-8") or "utf-8"
        content_type = response.headers.get("content-type", "")
        if content_type.startswith("application/json"):
            response.headers["content-type"] = f"application/json; charset={encoding}"
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


# Paths that stay reachable while maintenance mode is on: the login flow
# itself (auth + captcha), the public maintenance status, and readiness.
_MAINTENANCE_EXEMPT = (
    "/api/auth",
    "/api/captcha",
    "/api/system/ready",
    "/api/system/maintenance",
)


def _is_admin_request(request: Request, db) -> bool:
    """True when the request carries a valid JWT for an admin user."""
    try:
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return False
        payload = verify_access_token(auth_header[7:])
        user_id = payload.get("sub")
        if user_id is None:
            return False
        user = db.query(User).filter(User.id == int(user_id)).first()
        return user is not None and user.role == "admin" and user.is_active
    except Exception:  # noqa: BLE001 - any token problem means "not admin"
        return False


@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    """Maintenance mode (v3.0, server-side): when the `maintenance_mode`
    setting is "on", every /api call except the exempt paths above is
    answered 503 with the admin's custom message — unless the caller is
    an admin (admin bypass: admins can still log in and use the panel).
    The frontend login page shows the maintenance screen from the
    public /api/system/maintenance status. Also stashes the
    `system_encoding` setting on request.state for the security-headers
    middleware (response charset)."""
    path = request.url.path
    if path.startswith("/api/"):
        db = SessionLocal()
        try:
            request.state.system_encoding = get_setting_default(
                db, "system_encoding", "utf-8"
            )
            if not path.startswith(_MAINTENANCE_EXEMPT):
                if get_setting_default(db, "maintenance_mode", "off") == "on":
                    if not _is_admin_request(request, db):
                        message = get_setting_default(db, "maintenance_message", "")
                        return JSONResponse(
                            status_code=503,
                            content={"detail": "maintenance", "message": message},
                        )
        finally:
            db.close()
    return await call_next(request)


@app.middleware("http")
async def strip_4byte_middleware(request: Request, call_next):
    """Auto-strip 4-byte characters (v3.0): when the `strip_4byte`
    setting is "on" (default), every JSON request body's string values
    are stripped of characters outside the Basic Multilingual Plane
    (emoji, etc.) before any handler sees them — server-side, so no
    client can sneak one past. Multipart bodies are left untouched."""
    if (
        request.method in ("POST", "PUT", "PATCH")
        and request.url.path.startswith("/api/")
        and "application/json" in request.headers.get("content-type", "")
    ):
        db = SessionLocal()
        try:
            enabled = get_setting_default(db, "strip_4byte", "on") == "on"
        finally:
            db.close()
        if enabled:
            raw = await request.body()
            if raw:
                try:
                    data = json.loads(raw)
                except ValueError:
                    data = None
                if data is not None:
                    cleaned = strip_4byte_deep(data)
                    if cleaned != data:
                        request._body = json.dumps(cleaned).encode("utf-8")
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All routes are mounted under /api to match the frontend and README.
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(captcha.router, prefix="/api/captcha", tags=["Captcha"])
app.include_router(api_keys.router, prefix="/api/api-keys", tags=["API Keys"])
app.include_router(licenses.router, prefix="/api/licenses", tags=["Licenses"])
app.include_router(products.router, prefix="/api/products", tags=["Products"])
app.include_router(product_groups.router, prefix="/api/product-groups", tags=["Product Groups"])
app.include_router(blacklist.router, prefix="/api/blacklist", tags=["Blacklist"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(news.router, prefix="/api/news", tags=["News"])
app.include_router(downloads.router, prefix="/api/downloads", tags=["Downloads"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(languages.router, prefix="/api/languages", tags=["Languages"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(roles.router, prefix="/api/roles", tags=["Roles"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(sms.router, prefix="/api/sms", tags=["SMS"])
app.include_router(system.router, prefix="/api/system", tags=["System"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["Audit Logs"])


@app.get("/", tags=["Health Check"])
def health_check():
    """Health check."""
    return {"message": "API is running successfully!"}
