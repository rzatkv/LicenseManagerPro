"""Authentication routes: login, first-admin bootstrap registration."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserCreateRequest,
    UserResponse,
)
from services import users as user_service
from utils.auth import (
    create_access_token,
    verify_access_token,
    verify_password,
)

router = APIRouter()
optional_security = HTTPBearer(auto_error=False)


def _optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(optional_security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """The authenticated user when a Bearer token is present, else None."""
    if credentials is None:
        return None
    payload = verify_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if user_id is None:
        return None
    return db.query(User).filter(User.id == int(user_id)).first()


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with email + password and return a JWT access token."""
    user = db.query(User).filter(User.email == request.email).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is inactive")
    token = create_access_token(
        {"sub": str(user.id), "email": user.email, "role": user.role}
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/register", response_model=UserResponse, status_code=201)
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_optional_user),
):
    """Create a user.

    Openly allowed ONLY when no users exist yet (first-admin bootstrap, the
    new user is always created as an admin). Afterwards an admin JWT is
    required.
    """
    user_count = db.query(User).count()
    if user_count == 0:
        return user_service.create_user(
            UserCreateRequest(email=request.email, password=request.password, role="admin"),
            db,
        )
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user_service.create_user(
        UserCreateRequest(
            email=request.email, password=request.password, role=request.role
        ),
        db,
    )
