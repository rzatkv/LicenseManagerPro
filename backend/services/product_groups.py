"""Product group business logic (v2.2)."""
import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import Product, ProductGroup
from schemas import ProductGroupCreateRequest, ProductGroupUpdateRequest
from services.products import slugify


def serialize_group(group: ProductGroup) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "slug": group.slug,
        "description": group.description,
        "color": group.color,
        "sort_order": group.sort_order,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
    }


def get_group(group_id: int, db: Session) -> ProductGroup:
    group = db.query(ProductGroup).filter(ProductGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Product group not found")
    return group


def list_groups(db: Session):
    return (
        db.query(ProductGroup)
        .order_by(ProductGroup.sort_order, ProductGroup.name)
        .all()
    )


def _validate_color(color: str) -> str:
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color or ""):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid color: {color} (expected a #RRGGBB hex value)",
        )
    return color


def create_group(request: ProductGroupCreateRequest, db: Session) -> ProductGroup:
    slug = request.slug or slugify(request.name)
    if db.query(ProductGroup).filter(ProductGroup.slug == slug).first():
        raise HTTPException(
            status_code=400, detail=f"Product group slug '{slug}' already exists"
        )
    group = ProductGroup(
        name=request.name,
        slug=slug,
        description=request.description,
        color=_validate_color(request.color),
        sort_order=request.sort_order,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def update_group(
    group_id: int, request: ProductGroupUpdateRequest, db: Session
) -> ProductGroup:
    group = get_group(group_id, db)
    if request.slug is not None and request.slug != group.slug:
        if db.query(ProductGroup).filter(ProductGroup.slug == request.slug).first():
            raise HTTPException(
                status_code=400,
                detail=f"Product group slug '{request.slug}' already exists",
            )
        group.slug = request.slug
    if request.name is not None:
        group.name = request.name
    if request.description is not None:
        group.description = request.description
    if request.color is not None:
        group.color = _validate_color(request.color)
    if request.sort_order is not None:
        group.sort_order = request.sort_order
    db.commit()
    db.refresh(group)
    return group


def delete_group(group_id: int, db: Session) -> None:
    group = get_group(group_id, db)
    count = db.query(Product).filter(Product.group_id == group_id).count()
    if count:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete group: {count} product(s) reference it",
        )
    db.delete(group)
    db.commit()
