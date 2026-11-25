"""User routes (admin panel)."""
from typing import List

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import MessageResponse, UserCreateRequest, UserResponse, UserUpdateRequest
from services import users as user_service
from services.audit import log_audit
from utils.auth import get_current_user, require_admin
from utils.pagination import Pagination, paginate_query, pagination_params
from utils.permissions import require_permission

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user


@router.get("", response_model=List[UserResponse])
def list_users(
    response: Response,
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return paginate_query(db.query(User).order_by(User.id), response, page)


@router.post("", response_model=UserResponse, status_code=201)
def create_user(
    request: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users:write")),
):
    user = user_service.create_user(request, db)
    log_audit(
        db,
        current_user.email,
        "user.create",
        "user",
        user.id,
        {"email": user.email, "role": user.role},
    )
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    request: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users:write")),
):
    existing = user_service.get_user(user_id, db)
    role_changed = (
        request.role is not None and request.role != existing.role
    )
    user = user_service.update_user(user_id, request, db)
    log_audit(
        db,
        current_user.email,
        "user.role_change" if role_changed else "user.update",
        "user",
        user.id,
        {"email": user.email, "role": user.role},
    )
    return user


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users:write")),
):
    user_service.delete_user(user_id, db, current_user)
    log_audit(db, current_user.email, "user.delete", "user", user_id)
    return {"message": "User deleted successfully"}
