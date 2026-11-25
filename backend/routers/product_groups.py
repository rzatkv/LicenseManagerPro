"""Product group routes (v2.2; JWT; writes need products:write)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    MessageResponse,
    ProductGroupCreateRequest,
    ProductGroupResponse,
    ProductGroupUpdateRequest,
)
from services import product_groups as group_service
from services.audit import log_audit
from utils.auth import get_current_user
from utils.permissions import require_permission

router = APIRouter()

_write = require_permission("products:write")


@router.get("", response_model=list[ProductGroupResponse])
def list_groups(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    return [group_service.serialize_group(g) for g in group_service.list_groups(db)]


@router.post("", response_model=ProductGroupResponse, status_code=201)
def create_group(
    request: ProductGroupCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(_write),
):
    group = group_service.create_group(request, db)
    log_audit(
        db, current_user.email, "product_group.create", "product_group", group.id,
        {"slug": group.slug, "name": group.name},
    )
    return group_service.serialize_group(group)


@router.get("/{group_id}", response_model=ProductGroupResponse)
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    return group_service.serialize_group(group_service.get_group(group_id, db))


@router.put("/{group_id}", response_model=ProductGroupResponse)
def update_group(
    group_id: int,
    request: ProductGroupUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(_write),
):
    group = group_service.update_group(group_id, request, db)
    log_audit(
        db, current_user.email, "product_group.update", "product_group", group.id,
        {"slug": group.slug},
    )
    return group_service.serialize_group(group)


@router.delete("/{group_id}", response_model=MessageResponse)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(_write),
):
    group_service.delete_group(group_id, db)
    log_audit(db, current_user.email, "product_group.delete", "product_group", group_id)
    return {"message": "Product group deleted successfully"}
