"""User business logic."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import User
from schemas import UserCreateRequest, UserUpdateRequest
from utils.auth import hash_password

USER_ROLES = ["admin", "user"]


def create_user(request: UserCreateRequest, db: Session) -> User:
    if request.role not in USER_ROLES:
        raise HTTPException(
            status_code=400, detail=f"Invalid role: {request.role} (expected admin or user)"
        )
    if db.query(User).filter(User.email == request.email).first():
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    user = User(
        email=request.email,
        hashed_password=hash_password(request.password),
        role=request.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(user_id: int, db: Session) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def update_user(user_id: int, request: UserUpdateRequest, db: Session) -> User:
    user = get_user(user_id, db)
    if request.role is not None:
        if request.role not in USER_ROLES:
            raise HTTPException(
                status_code=400, detail=f"Invalid role: {request.role} (expected admin or user)"
            )
        user.role = request.role
    if request.is_active is not None:
        user.is_active = request.is_active
    db.commit()
    db.refresh(user)
    return user


def delete_user(user_id: int, db: Session, current_user: User) -> None:
    """Delete a user. Nobody may delete themselves, and the last active
    admin may not be deleted (at least one active admin must remain)."""
    user = get_user(user_id, db)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if user.role == "admin" and user.is_active:
        other_active_admins = (
            db.query(User)
            .filter(
                User.role == "admin",
                User.is_active == True,  # noqa: E712
                User.id != user.id,
            )
            .count()
        )
        if other_active_admins == 0:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    db.delete(user)
    db.commit()
