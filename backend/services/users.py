"""User business logic."""
import json

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import Role, User
from schemas import UserCreateRequest, UserUpdateRequest
from utils.auth import hash_password

USER_ROLES = ["admin", "manager", "support", "viewer"]

# Avatar validation (v2.3): only raster data URLs or plain http(s) URLs.
# SVG is rejected (it can carry scripts); avatars render in <img>, but a
# data:image/svg+xml URL must never be stored. 3,000,000 chars ≈ 2 MB.
AVATAR_DATA_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/webp;base64,",
)
AVATAR_MAX_LENGTH = 3_000_000


def is_admin_equivalent(user: User) -> bool:
    """True when the user holds the "*" permission (admin role or a
    custom role with all permissions)."""
    from utils.permissions import user_has_permission

    return user_has_permission(user, "*")


def role_request_is_admin(request_role, request_role_id, db: Session) -> bool:
    """True when a create/update request would assign an
    admin-equivalent role (checked BEFORE the change is applied)."""
    if request_role_id is not None:
        row = db.query(Role).filter(Role.id == request_role_id).first()
        if row is None:
            return False  # resolve_role raises the 400 for this case
        try:
            return "*" in json.loads(row.permissions or "[]")
        except (ValueError, TypeError):
            return False
    return request_role == "admin"


def validate_avatar_url(avatar_url: str | None) -> None:
    """Reject avatar values that are not a raster data URL or an http(s)
    URL (400). Empty/None clears the avatar and is always allowed."""
    if not avatar_url:
        return
    if len(avatar_url) > AVATAR_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Avatar is too large (max ~2 MB)")
    if avatar_url.startswith(AVATAR_DATA_PREFIXES):
        return
    if avatar_url.startswith(("http://", "https://")):
        return
    raise HTTPException(
        status_code=400,
        detail="Avatar must be a PNG/JPEG/WebP data URL or an http(s) URL (SVG is not allowed)",
    )


def resolve_role(request_role, request_role_id, db: Session) -> tuple[str, int | None]:
    """Resolve (role string, role_id) from a create/update request.

    A role_id (custom or built-in role row) wins and the role string is
    synced from the row's slug. Otherwise the legacy role name is used
    and role_id is synced to the matching built-in row (or NULL when the
    row does not exist yet, e.g. before seeding).
    """
    if request_role_id is not None:
        row = db.query(Role).filter(Role.id == request_role_id).first()
        if row is None:
            raise HTTPException(status_code=400, detail=f"Role id {request_role_id} not found")
        return row.slug, row.id
    if request_role is not None:
        if request_role not in USER_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role: {request_role} (expected one of {USER_ROLES})",
            )
        row = db.query(Role).filter(Role.slug == request_role).first()
        return request_role, row.id if row else None
    return "viewer", None


def create_user(request: UserCreateRequest, db: Session) -> User:
    role, role_id = resolve_role(request.role, request.role_id, db)
    if db.query(User).filter(User.email == request.email).first():
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    user = User(
        email=request.email,
        hashed_password=hash_password(request.password),
        role=role,
        role_id=role_id,
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
    if request.role is not None or request.role_id is not None:
        role, role_id = resolve_role(request.role, request.role_id, db)
        user.role = role
        user.role_id = role_id
    if request.is_active is not None:
        user.is_active = request.is_active
    if request.display_name is not None:
        user.display_name = request.display_name or None
    if request.avatar_url is not None:
        validate_avatar_url(request.avatar_url)
        user.avatar_url = request.avatar_url or None
    if request.phone is not None:
        # v3.0: phone for SMS 2FA / SMS notifications; free-form, max 32.
        phone = (request.phone or "").strip()
        if len(phone) > 32:
            raise HTTPException(status_code=400, detail="phone must be at most 32 characters")
        user.phone = phone or None
    db.commit()
    db.refresh(user)
    return user


def delete_user(user_id: int, db: Session, current_user: User) -> None:
    """Delete a user. Nobody may delete themselves, and the last active
    admin may not be deleted (at least one active admin must remain)."""
    from utils.permissions import user_has_permission

    user = get_user(user_id, db)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if user_has_permission(user, "*") and user.is_active:
        other_active_admins = sum(
            1
            for u in db.query(User).filter(User.is_active == True, User.id != user.id).all()  # noqa: E712
            if user_has_permission(u, "*")
        )
        if other_active_admins == 0:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    db.delete(user)
    db.commit()
