"""JWT authentication helpers (PyJWT) and password hashing.

The JWT secret comes from the SECRET_KEY environment variable (see config.py);
there is no hardcoded production secret.
"""
import secrets
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY
from database import get_db, utcnow
from models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# A bcrypt hash of a random string, used ONLY so login always runs the
# same password verification for unknown emails (no user enumeration
# via timing). It matches no real password.
DUMMY_PASSWORD_HASH = pwd_context.hash(secrets.token_urlsafe(32))
# auto_error=False so a missing token becomes a 401 (not FastAPI's 403).
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    # v3.0.6 (security, L7): bcrypt truncates past 72 bytes — refuse
    # instead of silently hashing a prefix. The API schemas reject
    # long passwords first; this guards direct callers.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    expire = utcnow() + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_access_token(token: str) -> dict:
    """Decode and validate a JWT, returning its payload."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    db: Session = Depends(get_db),
) -> User:
    """Dependency: the authenticated user from the Bearer token."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_access_token(credentials.credentials)
    # v2.3: short-lived 2FA temp tokens (purpose="2fa") are NOT access
    # tokens and must never authenticate an API call.
    if payload.get("purpose") is not None:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: the authenticated user must have the admin role.

    v2.3: a custom role whose permission list is ["*"] counts as admin,
    and the legacy "admin" role string still works (its seeded permission
    set is {"*"}).
    """
    from utils.permissions import user_has_permission

    if not user_has_permission(current_user, "*"):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user
