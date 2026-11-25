"""LicenseManagerPro API — FastAPI backend.

All routes live under /api (see README.md for the endpoint table).
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import APP_VERSION, CORS_ORIGINS
from database import SessionLocal, create_tables, seed_settings
from models import User
from routers import api_keys, auth, dashboard, licenses, settings, system, users

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up the application...")
    create_tables()
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
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(system.router, prefix="/api/system", tags=["System"])


@app.get("/", tags=["Health Check"])
def health_check():
    """Health check."""
    return {"message": "API is running successfully!"}
