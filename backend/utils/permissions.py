"""Role-based permissions (v2.0).

Roles (exact strings): "admin", "manager", "support", "viewer".

- admin: everything.
- manager: everything except managing users/roles and deleting settings.
- support: read everything + create/renew/validate licenses + create API keys;
  no deletes, no product/user/settings writes.
- viewer: read-only.

The legacy "user" role (pre-v2.0) is treated as "support" for permission
checks, so old accounts keep working; new users must use one of the four
roles above (see services/users.py USER_ROLES).
"""
from fastapi import Depends, HTTPException

from models import User
from utils.auth import get_current_user

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {"*"},
    "manager": {
        "products:write",
        "licenses:create",
        "licenses:renew",
        "licenses:write",
        "licenses:delete",
        "api_keys:create",
        "api_keys:write",
        "languages:write",
        "settings:write",
        "system:check-expiring",
        "audit:read",
    },
    "support": {
        "licenses:create",
        "licenses:renew",
        "api_keys:create",
    },
    "viewer": set(),
    # Legacy pre-v2.0 role, kept working as "support".
    "user": {
        "licenses:create",
        "licenses:renew",
        "api_keys:create",
    },
}

# Every permission key the app knows (v2.3, shown as a checklist in the
# Roles page). Built-in roles above are the seeded defaults.
ALL_PERMISSIONS: list[str] = sorted(
    {
        "products:write",
        "licenses:create",
        "licenses:renew",
        "licenses:write",
        "licenses:delete",
        "api_keys:create",
        "api_keys:write",
        "languages:write",
        "settings:write",
        "system:check-expiring",
        "audit:read",
        "audit:delete",
        "users:write",
        "roles:write",
        "downloads:read",
    }
)


def _permissions_for_user(user) -> set[str]:
    """Effective permission set for a user.

    v2.3: when the user links to a Role row (role_id), the row's
    permission list wins. Otherwise the legacy role-name map above
    applies, so pre-v2.3 accounts keep working unchanged.
    """
    import json

    role_row = getattr(user, "role_row", None)
    if role_row is not None:
        try:
            perms = set(json.loads(role_row.permissions or "[]"))
        except (ValueError, TypeError):
            perms = set()
        return perms
    return ROLE_PERMISSIONS.get(user.role, set())


def role_has_permission(role: str, perm: str) -> bool:
    perms = ROLE_PERMISSIONS.get(role, set())
    return "*" in perms or perm in perms


def user_has_permission(user, perm: str) -> bool:
    perms = _permissions_for_user(user)
    return "*" in perms or perm in perms


def require_permission(perm: str):
    """FastAPI dependency factory: the current user must hold `perm`."""

    def _check(current_user: User = Depends(get_current_user)) -> User:
        if not user_has_permission(current_user, perm):
            raise HTTPException(
                status_code=403,
                detail=f"Permission '{perm}' required",
            )
        return current_user

    return _check


def require_admin_or_manager(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: the current user must be an admin or a manager.

    v2.3: a custom role counts when it holds the manager-level
    "settings:write" permission (or "*").
    """
    if (
        current_user.role not in ("admin", "manager")
        and not user_has_permission(current_user, "settings:write")
        and not user_has_permission(current_user, "*")
    ):
        raise HTTPException(
            status_code=403, detail="Admin or manager privileges required"
        )
    return current_user
