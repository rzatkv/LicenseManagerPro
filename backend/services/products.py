"""Product business logic (v2.0)."""
import json
import re
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import License, Product
from schemas import ProductCreateRequest, ProductUpdateRequest

BILLING_CYCLES = [
    "monthly",
    "quarterly",
    "semiannual",
    "annual",
    "biennial",
    "lifetime",
]

# Billing cycle -> calendar months (lifetime has no expiry).
CYCLE_MONTHS = {
    "monthly": 1,
    "quarterly": 3,
    "semiannual": 6,
    "annual": 12,
    "biennial": 24,
}

PRODUCT_STATUSES = ["active", "inactive"]


def validate_billing_cycles(cycles) -> list[str]:
    """A product's billing_cycles must be a non-empty subset of the six."""
    if not cycles:
        raise HTTPException(
            status_code=400,
            detail="billing_cycles must be a non-empty list",
        )
    invalid = [c for c in cycles if c not in BILLING_CYCLES]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid billing cycle(s): {invalid} (expected a subset of {BILLING_CYCLES})",
        )
    # De-duplicate, preserving order.
    seen = []
    for cycle in cycles:
        if cycle not in seen:
            seen.append(cycle)
    return seen


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "product"


def serialize_product(product: Product) -> dict:
    try:
        cycles = json.loads(product.billing_cycles or "[]")
    except (TypeError, ValueError):
        cycles = []
    try:
        events = json.loads(product.webhook_events or "[]")
    except (TypeError, ValueError):
        events = []
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "description": product.description,
        "price": product.price,
        "currency": product.currency,
        "status": product.status,
        "billing_cycles": cycles,
        "webhook_url": product.webhook_url,
        "webhook_events": events,
        "webhook_secret": product.webhook_secret,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }


def get_product(product_id: int, db: Session) -> Product:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def list_products(db: Session, status: Optional[str] = None):
    query = db.query(Product)
    if status is not None:
        if status not in PRODUCT_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {status} (expected one of {PRODUCT_STATUSES})",
            )
        query = query.filter(Product.status == status)
    return query.order_by(Product.id).all()


def create_product(request: ProductCreateRequest, db: Session) -> Product:
    cycles = validate_billing_cycles(request.billing_cycles)
    if request.status not in PRODUCT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {request.status} (expected one of {PRODUCT_STATUSES})",
        )
    slug = request.slug or slugify(request.name)
    if db.query(Product).filter(Product.slug == slug).first():
        raise HTTPException(status_code=400, detail=f"Product slug '{slug}' already exists")
    product = Product(
        name=request.name,
        slug=slug,
        description=request.description,
        price=request.price,
        currency=request.currency or "USD",
        status=request.status,
        billing_cycles=json.dumps(cycles),
        webhook_url=request.webhook_url,
        webhook_events=json.dumps(request.webhook_events or []),
        webhook_secret=request.webhook_secret,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_product(product_id: int, request: ProductUpdateRequest, db: Session) -> Product:
    product = get_product(product_id, db)
    if request.billing_cycles is not None:
        product.billing_cycles = json.dumps(validate_billing_cycles(request.billing_cycles))
    if request.name is not None:
        product.name = request.name
    if request.slug is not None:
        if request.slug != product.slug and db.query(Product).filter(
            Product.slug == request.slug
        ).first():
            raise HTTPException(
                status_code=400, detail=f"Product slug '{request.slug}' already exists"
            )
        product.slug = request.slug
    if request.description is not None:
        product.description = request.description
    if request.price is not None:
        product.price = request.price
    if request.currency is not None:
        product.currency = request.currency
    if request.status is not None:
        if request.status not in PRODUCT_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {request.status} (expected one of {PRODUCT_STATUSES})",
            )
        product.status = request.status
    if request.webhook_url is not None:
        product.webhook_url = request.webhook_url
    if request.webhook_events is not None:
        product.webhook_events = json.dumps(request.webhook_events)
    if request.webhook_secret is not None:
        product.webhook_secret = request.webhook_secret
    db.commit()
    db.refresh(product)
    return product


def delete_product(product_id: int, db: Session) -> None:
    product = get_product(product_id, db)
    count = db.query(License).filter(License.product_id == product_id).count()
    if count:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete product: {count} license(s) reference it",
        )
    db.delete(product)
    db.commit()
