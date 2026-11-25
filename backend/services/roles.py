"""Role business logic (v2.3).

Built-in roles (admin/manager/support/viewer) are seeded at startup and
are protected: they cannot be renamed to another slug, and they cannot
be deleted. A custom role cannot be deleted while users reference it.
"""

import json
import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import Role, User
from schemas import RoleCreateRequest, RoleUpdateRequest
from utils.permissions import ALL_PERMISSIONS, ROLE_PERMISSIONS


def serialize_role(role: Role, db: Session) -> dict:
    try:
        perms = json.loads(role.permissions or "[]")
    except (ValueError, TypeError):
        perms = []
    return {
        "id": role.id,
        "name": role.name,
        "slug": role.slug,
        "description": role.description,
        "permissions": perms if isinstance(perms, list) else [],
        "is_builtin": role.is_builtin,
        "users_count": db.query(User).filter(User.role_id == role.id).count(),
        "created_at": role.created_at,
        "updated_at": role.updated_at,
    }


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return slug or "role"


def validate_permissions(perms) -> list[str]:
    """Permissions must be a list of known keys (or "*")."""
    if perms is None:
        return []
    if not isinstance(perms, list):
        raise HTTPException(status_code=400, detail="permissions must be a list")
    unknown = [p for p in perms if p != "*" and p not in ALL_PERMISSIONS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown permission(s): {unknown}")
    seen = []
    for p in perms:
        if p not in seen:
            seen.append(p)
    return seen


def get_role(role_id: int, db: Session) -> Role:
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


def list_roles(db: Session) -> list[Role]:
    return db.query(Role).order_by(Role.is_builtin.desc(), Role.name).all()


def create_role(request: RoleCreateRequest, db: Session) -> Role:
    slug = slugify(request.slug or request.name)
    if slug in ROLE_PERMISSIONS and slug != "user":
        raise HTTPException(
            status_code=400,
            detail=f"'{slug}' is a built-in role slug; pick another name",
        )
    if db.query(Role).filter(Role.slug == slug).first():
        raise HTTPException(status_code=400, detail=f"Role slug '{slug}' already exists")
    if db.query(Role).filter(Role.name == request.name).first():
        raise HTTPException(status_code=400, detail=f"Role '{request.name}' already exists")
    role = Role(
        name=request.name,
        slug=slug,
        description=request.description,
        permissions=json.dumps(validate_permissions(request.permissions)),
        is_builtin=False,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def update_role(role_id: int, request: RoleUpdateRequest, db: Session) -> Role:
    role = get_role(role_id, db)
    if request.name is not None:
        if role.is_builtin:
            raise HTTPException(status_code=400, detail="Built-in roles cannot be renamed")
        if request.name != role.name and db.query(Role).filter(Role.name == request.name).first():
            raise HTTPException(status_code=400, detail=f"Role '{request.name}' already exists")
        role.name = request.name
    if request.description is not None:
        role.description = request.description
    if request.permissions is not None:
        if role.is_builtin and role.slug == "admin":
            raise HTTPException(
                status_code=400,
                detail="The admin role always holds every permission",
            )
        role.permissions = json.dumps(validate_permissions(request.permissions))
    db.commit()
    db.refresh(role)
    return role


def delete_role(role_id: int, db: Session) -> None:
    role = get_role(role_id, db)
    if role.is_builtin:
        raise HTTPException(status_code=400, detail="Built-in roles cannot be deleted")
    assigned = db.query(User).filter(User.role_id == role_id).count()
    if assigned:
        raise HTTPException(
            status_code=400,
            detail=f"Role is assigned to {assigned} user(s); reassign them first",
        )
    db.delete(role)
    db.commit()
