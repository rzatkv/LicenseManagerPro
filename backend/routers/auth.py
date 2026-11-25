"""Authentication routes: login, first-admin bootstrap registration."""

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db, utcnow
from models import User
from schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    TwoFABackupCodesResponse,
    TwoFADisableRequest,
    TwoFALoginRequest,
    TwoFASetupResponse,
    TwoFAStatusResponse,
    TwoFAVerifyRequest,
    UserCreateRequest,
    UserResponse,
)
from services import twofa as twofa_service
from services import users as user_service
from services.audit import log_audit
from utils.auth import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    get_current_user,
    verify_access_token,
    verify_password,
)
from utils.rate_limit import (
    is_login_locked,
    rate_limit_2fa,
    rate_limit_auth,
    record_failed_login,
)

router = APIRouter()
optional_security = HTTPBearer(auto_error=False)


def _optional_user(
    credentials: HTTPAuthorizationCredentials | None = Security(optional_security),
    db: Session = Depends(get_db),
) -> User | None:
    """The authenticated user when a Bearer token is present, else None."""
    if credentials is None:
        return None
    payload = verify_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if user_id is None:
        return None
    return db.query(User).filter(User.id == int(user_id)).first()


@router.post("/login", response_model=TokenResponse)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
    _rate_limited=Depends(rate_limit_auth),
):
    """Authenticate with email + password and return a JWT access token.

    No user enumeration: an unknown email, a wrong password and an
    inactive account all produce the same 401 message, and the password
    is always verified against a hash (a dummy one for unknown users)
    so the timing does not reveal whether the account exists. Five
    failures in 15 minutes lock the email for 15 minutes (429) —
    including for unknown emails, so the lockout reveals nothing either.
    Failures are audit-logged (admins can see them; the client cannot).
    """
    if is_login_locked(request.email):
        raise HTTPException(
            status_code=429, detail="Too many failed login attempts, try again later"
        )
    user = db.query(User).filter(User.email == request.email).first()
    # Always run the bcrypt verify (dummy hash for unknown users) so the
    # response time does not reveal whether the email exists.
    password_ok = verify_password(
        request.password,
        user.hashed_password if user is not None else DUMMY_PASSWORD_HASH,
    )
    if user is None or not password_ok:
        record_failed_login(request.email)
        log_audit(db, request.email, "user.login_failed", "user", None,
                  {"reason": "invalid_credentials"})
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        record_failed_login(request.email)
        log_audit(db, request.email, "user.login_failed", "user", user.id,
                  {"reason": "inactive"})
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # v2.3: TOTP users do not get a JWT yet — password OK, second factor
    # pending. The temp token is exchanged at POST /auth/verify-2fa.
    if user.totp_enabled:
        from services import twofa as twofa_service

        return {
            "access_token": "",
            "token_type": "bearer",
            "requires_2fa": True,
            "temp_token": twofa_service.make_temp_token(user),
        }
    user.last_login_at = utcnow()
    db.commit()
    log_audit(db, user.email, "user.login", "user", user.id)
    token = create_access_token(
        {"sub": str(user.id), "email": user.email, "role": user.role}
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/register", response_model=UserResponse, status_code=201)
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(_optional_user),
    _rate_limited=Depends(rate_limit_auth),
):
    """Create a user.

    Openly allowed ONLY when no users exist yet (first-admin bootstrap, the
    new user is always created as an admin). Afterwards an admin JWT is
    required.
    """
    user_count = db.query(User).count()
    if user_count == 0:
        user = user_service.create_user(
            UserCreateRequest(email=request.email, password=request.password, role="admin"),
            db,
        )
        log_audit(db, user.email, "user.create", "user", user.id, {"email": user.email, "role": "admin"})
        return user
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    user = user_service.create_user(
        UserCreateRequest(
            email=request.email, password=request.password, role=request.role
        ),
        db,
    )
    log_audit(
        db,
        current_user.email,
        "user.create",
        "user",
        user.id,
        {"email": user.email, "role": user.role},
    )
    return user


# --- Two-factor authentication (v2.3) ---------------------------------------


@router.post("/verify-2fa", response_model=TokenResponse)
def verify_2fa_login(
    request: TwoFALoginRequest,
    db: Session = Depends(get_db),
    _rate_limited=Depends(rate_limit_2fa),
):
    """Second step of a 2FA login: exchange a temp token + TOTP code (or
    a one-time backup code) for a JWT access token."""
    user = twofa_service.user_from_temp_token(request.temp_token, db)
    if not user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled for this user")
    if not twofa_service.verify_code(user, request.code, db):
        log_audit(db, user.email, "user.login_2fa_failed", "user", user.id)
        raise HTTPException(status_code=401, detail="Invalid verification code")
    user.last_login_at = utcnow()
    db.commit()
    log_audit(db, user.email, "user.login", "user", user.id, {"via": "2fa"})
    token = create_access_token(
        {"sub": str(user.id), "email": user.email, "role": user.role}
    )
    return {"access_token": token, "token_type": "bearer"}


@router.get("/2fa/status", response_model=TwoFAStatusResponse)
def twofa_status(current_user: User = Depends(get_current_user)):
    """Whether the current user has 2FA enabled (and backup codes left)."""
    return {
        "enabled": current_user.totp_enabled,
        "backup_codes_remaining": twofa_service.backup_codes_remaining(current_user),
    }


@router.post("/2fa/setup", response_model=TwoFASetupResponse)
def twofa_setup(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start 2FA setup: returns a fresh secret + QR code. 2FA stays OFF
    until POST /2fa/verify confirms a code from the authenticator app."""
    if current_user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")
    return twofa_service.setup_totp(current_user, db)


@router.post("/2fa/verify", response_model=TwoFABackupCodesResponse)
def twofa_verify(
    request: TwoFAVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirm the authenticator code to enable 2FA. Returns the one-time
    backup codes — shown once, never stored in plain text."""
    codes = twofa_service.verify_and_enable(current_user, request.code, db)
    log_audit(db, current_user.email, "user.2fa_enable", "user", current_user.id)
    return {"backup_codes": codes}


@router.post("/2fa/disable", response_model=TwoFABackupCodesResponse)
def twofa_disable(
    request: TwoFADisableRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disable 2FA (needs the account password + a current TOTP code)."""
    twofa_service.disable_totp(current_user, request.password, request.code, db)
    log_audit(db, current_user.email, "user.2fa_disable", "user", current_user.id)
    return {"backup_codes": []}
