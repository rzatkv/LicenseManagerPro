"""TOTP two-factor authentication (v2.3).

Setup: an authenticated user requests a secret; the response carries the
base32 secret, the otpauth:// URL and a QR-code data URL (PNG). The
secret is stored on the user row but 2FA stays OFF until the user proves
possession by submitting a correct code. Disabling needs the password
plus a current code. Backup codes are one-time, SHA-256 hashed, shown
once at enable time.

Login with 2FA: POST /api/auth/login verifies the password, then returns
{requires_2fa: true, temp_token} instead of a JWT. The temp token is a
short-lived (5 min) JWT with purpose "2fa" and must be exchanged at
POST /api/auth/verify-2fa with a TOTP code (or a backup code) for a
real access token.
"""

import base64
import hashlib
import io
import secrets
from datetime import timedelta

import pyotp
import qrcode
from fastapi import HTTPException
from sqlalchemy.orm import Session

from database import utcnow
from models import User
from utils.auth import create_access_token, verify_access_token, verify_password

TEMP_TOKEN_PURPOSE = "2fa"
TEMP_TOKEN_MINUTES = 5
BACKUP_CODE_COUNT = 8


def _new_secret() -> str:
    return pyotp.random_base32()


def _qr_data_url(otpauth_url: str) -> str:
    img = qrcode.make(otpauth_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _hash_backup_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _new_backup_codes() -> tuple[list[str], list[str]]:
    """(plain codes to show once, hashes to store)."""
    plain = [
        "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))
        for _ in range(BACKUP_CODE_COUNT)
    ]
    return plain, [_hash_backup_code(c) for c in plain]


def setup_totp(user: User, db: Session, issuer: str = "LicenseManagerPro") -> dict:
    """Start 2FA setup: fresh secret + QR. 2FA stays disabled until verified."""

    secret = _new_secret()
    user.totp_secret = secret
    user.totp_enabled = False
    db.commit()
    totp = pyotp.TOTP(secret)
    otpauth_url = totp.provisioning_uri(name=user.email, issuer_name=issuer)
    return {
        "secret": secret,
        "otpauth_url": otpauth_url,
        "qr_data_url": _qr_data_url(otpauth_url),
    }


def verify_and_enable(user: User, code: str, db: Session) -> list[str]:
    """Verify a code against the pending secret; on success enable 2FA
    and return fresh backup codes (plain, shown once)."""
    import json

    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA setup has not been started")
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid verification code")
    plain, hashed = _new_backup_codes()
    user.totp_enabled = True
    user.backup_codes = json.dumps(hashed)
    db.commit()
    return plain


def disable_totp(user: User, password: str, code: str, db: Session) -> None:
    """Disable 2FA: needs the account password plus a current TOTP code."""
    if not user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled")
    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid password")
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid verification code")
    user.totp_enabled = False
    user.totp_secret = None
    user.backup_codes = "[]"
    db.commit()


def verify_code(user: User, code: str, db: Session) -> bool:
    """Check a TOTP code (or a one-time backup code, which is consumed).
    Returns True on success, False otherwise.

    Replay protection: a TOTP code that was already accepted within its
    validity window is rejected — a code authenticates exactly once.
    pyotp's verify uses hmac.compare_digest internally (constant time).
    """
    import hmac as hmac_module
    import json

    code = (code or "").strip()
    if user.totp_enabled and user.totp_secret:
        # Reject a replay of the last accepted code inside its window
        # (TOTP steps are 30s; valid_window=1 admits ±1 step, so 90s
        # covers every step the previous acceptance could have used).
        if (
            user.totp_last_code == code
            and user.totp_last_used_at is not None
            and (utcnow() - user.totp_last_used_at) < timedelta(seconds=90)
        ):
            return False
        if pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            user.totp_last_code = code
            user.totp_last_used_at = utcnow()
            db.commit()
            return True
    # Backup codes: compare hashes with a constant-time compare, consume
    # the code on match (single-use).
    try:
        hashed = json.loads(user.backup_codes or "[]")
    except (ValueError, TypeError):
        hashed = []
    digest = _hash_backup_code(code)
    matched = None
    for stored in hashed:
        if hmac_module.compare_digest(digest, stored):
            matched = stored
            break
    if matched is not None:
        hashed.remove(matched)
        user.backup_codes = json.dumps(hashed)
        db.commit()
        return True
    return False


def make_temp_token(user: User) -> str:
    """Short-lived token proving "password OK, 2FA pending"."""
    return create_access_token(
        {"sub": str(user.id), "purpose": TEMP_TOKEN_PURPOSE},
        expires_delta=timedelta(minutes=TEMP_TOKEN_MINUTES),
    )


def user_from_temp_token(temp_token: str, db: Session) -> User:
    """Validate a temp token and return its user (401 on any problem)."""
    try:
        payload = verify_access_token(temp_token)
    except HTTPException as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired 2FA session") from exc
    if payload.get("purpose") != TEMP_TOKEN_PURPOSE:
        raise HTTPException(status_code=401, detail="Invalid 2FA session")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid 2FA session")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def backup_codes_remaining(user: User) -> int:
    import json

    try:
        return len(json.loads(user.backup_codes or "[]"))
    except (ValueError, TypeError):
        return 0
