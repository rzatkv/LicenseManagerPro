"""Role routes (v2.3, admin only): CRUD for custom roles.

Built-in roles (admin/manager/support/viewer) are protected: they cannot
be renamed, the admin role's permissions cannot be edited, and no
built-in role can be deleted. A role assigned to users cannot be deleted.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    MessageResponse,
    RoleCreateRequest,
    RoleResponse,
    RoleUpdateRequest,
)
from services import roles as role_service
from services.audit import log_audit
from utils.permissions import ALL_PERMISSIONS, require_permission

router = APIRouter()


@router.get("/permissions", response_model=list[str])
def list_permissions(_admin: User = Depends(require_permission("roles:write"))):
    """All permission keys a role may hold (for the permission checklist)."""
    return ALL_PERMISSIONS


@router.get("", response_model=list[RoleResponse])
def list_roles(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission("roles:write")),
):
    return [role_service.serialize_role(r, db) for r in role_service.list_roles(db)]


@router.post("", response_model=RoleResponse, status_code=201)
def create_role(
    request: RoleCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles:write")),
):
    role = role_service.create_role(request, db)
    log_audit(db, current_user.email, "role.create", "role", role.id, {"name": role.name})
    return role_service.serialize_role(role, db)


@router.put("/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: int,
    request: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles:write")),
):
    role = role_service.update_role(role_id, request, db)
    log_audit(db, current_user.email, "role.update", "role", role.id, {"name": role.name})
    return role_service.serialize_role(role, db)


@router.delete("/{role_id}", response_model=MessageResponse)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles:write")),
):
    role_service.delete_role(role_id, db)
    log_audit(db, current_user.email, "role.delete", "role", role_id)
    return {"message": "Role deleted successfully"}
