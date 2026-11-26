"""User routes (admin panel)."""
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserSetting
from schemas import (
    MessageResponse,
    UserCreateRequest,
    UserPreferencesPutRequest,
    UserPreferencesResponse,
    UserResponse,
    UserUpdateRequest,
)
from services import notify_channels as notify_channels_service
from services import users as user_service
from services.audit import log_audit
from utils.auth import get_current_user
from utils.pagination import Pagination, paginate_query, pagination_params
from utils.permissions import require_permission

router = APIRouter()

# Theme preference values (v3.0, per-admin themes). The frontend sends
# exactly these; anything else is rejected so a bad/stale client can never
# store a theme the UI cannot render (and a stored custom colour can never
# smuggle a non-colour CSS value into the style properties theme.js sets).
THEME_PRESETS = {
    "default", "ocean", "forest", "sunset", "graphite",
    "rose", "teal", "amber", "lime", "ruby", "custom",
}
THEME_MODES = {"light", "dark", "auto"}
THEME_CUSTOM_FIELDS = {"accent", "accent2", "bg", "surface"}
_HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _validate_theme_preference(value):
    """400 unless `value` is a well-formed theme dict."""
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="theme preference must be an object")
    preset = value.get("preset")
    if preset is not None and preset not in THEME_PRESETS:
        raise HTTPException(status_code=400, detail=f"unknown theme preset: {preset}")
    mode = value.get("mode")
    if mode is not None and mode not in THEME_MODES:
        raise HTTPException(status_code=400, detail=f"unknown theme mode: {mode}")
    custom = value.get("custom")
    if custom is not None:
        if not isinstance(custom, dict):
            raise HTTPException(status_code=400, detail="theme.custom must be an object")
        for key, colour in custom.items():
            if key not in THEME_CUSTOM_FIELDS:
                raise HTTPException(status_code=400, detail=f"unknown theme.custom field: {key}")
            if not isinstance(colour, str) or not _HEX_COLOR.match(colour):
                raise HTTPException(status_code=400, detail=f"theme.custom.{key} must be a hex colour")


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user


@router.put("/me", response_model=UserResponse)
def update_my_profile(
    request: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update your own profile (display name, avatar, phone). Role changes are
    ignored here — only admins change roles, via PUT /users/{id}."""
    profile_request = UserUpdateRequest(
        display_name=request.display_name,
        avatar_url=request.avatar_url,
        phone=request.phone,
    )
    user = user_service.update_user(current_user.id, profile_request, db)
    log_audit(db, current_user.email, "user.profile_update", "user", user.id)
    return user


@router.get("/me/preferences", response_model=UserPreferencesResponse)
def get_my_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-user preferences (theme, dashboard layout, …) as one dict."""
    prefs = {}
    for row in db.query(UserSetting).filter(UserSetting.user_id == current_user.id).all():
        try:
            prefs[row.key] = json.loads(row.value or "null")
        except (ValueError, TypeError):
            prefs[row.key] = None
    return {"preferences": prefs}


@router.put("/me/preferences", response_model=UserPreferencesResponse)
def put_my_preference(
    request: UserPreferencesPutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Store one preference key (theme, dashboard layout, …)."""
    if request.key == "theme":
        _validate_theme_preference(request.value)
    row = (
        db.query(UserSetting)
        .filter(
            UserSetting.user_id == current_user.id,
            UserSetting.key == request.key,
        )
        .first()
    )
    if row is None:
        db.add(
            UserSetting(
                user_id=current_user.id,
                key=request.key,
                value=json.dumps(request.value),
            )
        )
    else:
        row.value = json.dumps(request.value)
    db.commit()
    return get_my_preferences(db=db, current_user=current_user)


@router.get("", response_model=list[UserResponse])
def list_users(
    response: Response,
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission("users:write")),
):
    return paginate_query(db.query(User).order_by(User.id), response, page)


@router.post("", response_model=UserResponse, status_code=201)
def create_user(
    request: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users:write")),
):
    # Privilege-escalation guard: only an admin may create an
    # admin-equivalent user (a custom role with "*" counts).
    if user_service.role_request_is_admin(request.role, request.role_id, db) and not user_service.is_admin_equivalent(current_user):
        raise HTTPException(status_code=403, detail="Only an admin can create an admin user")
    user = user_service.create_user(request, db)
    log_audit(
        db,
        current_user.email,
        "user.create",
        "user",
        user.id,
        {"email": user.email, "role": user.role},
    )
    notify_channels_service.notify_event(
        db,
        "user_created",
        "New user created",
        f"User {user.email} was created with role {user.role}.",
        type_="info",
        link="/users",
        context={"user_email": user.email, "role": user.role},
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
    # Privilege-escalation guard: only an admin may modify an
    # admin-equivalent user or promote anyone to an admin-equivalent
    # role (a custom role with "*" counts).
    if not user_service.is_admin_equivalent(current_user):
        if user_service.is_admin_equivalent(existing):
            raise HTTPException(status_code=403, detail="Only an admin can modify an admin user")
        if (request.role is not None or request.role_id is not None) and user_service.role_request_is_admin(request.role, request.role_id, db):
            raise HTTPException(status_code=403, detail="Only an admin can assign an admin role")
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
