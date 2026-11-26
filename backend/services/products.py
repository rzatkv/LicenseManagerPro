"""Product business logic (v2.0)."""
import json
import re

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
    try:
        security_overrides = json.loads(product.security_overrides or "null")
    except (TypeError, ValueError):
        security_overrides = None
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "description": product.description,
        "status": product.status,
        "billing_cycles": cycles,
        "webhook_url": product.webhook_url,
        "webhook_events": events,
        "webhook_secret": product.webhook_secret,
        "group_id": product.group_id,
        "key_prefix": product.key_prefix,
        "key_segments": product.key_segments,
        "key_segment_length": product.key_segment_length,
        "max_reissues": product.max_reissues,
        "security_overrides": security_overrides,
        "notes": product.notes,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }


def get_product(product_id: int, db: Session) -> Product:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def list_products(
    db: Session,
    status: str | None = None,
    group_id: int | None = None,
    slug: str | None = None,
):
    query = db.query(Product)
    if status is not None:
        if status not in PRODUCT_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {status} (expected one of {PRODUCT_STATUSES})",
            )
        query = query.filter(Product.status == status)
    if group_id is not None:
        query = query.filter(Product.group_id == group_id)
    if slug is not None:
        # Exact slug lookup (used by the WHMCS module / WooCommerce plugin).
        query = query.filter(Product.slug == slug)
    return query.order_by(Product.id).all()


def validate_webhook_url_scheme(url: str | None) -> None:
    """Reject non-http(s) webhook URLs at write time (400). The full
    SSRF check (private/internal hosts) runs at dispatch time in
    services.webhooks.validate_webhook_url — a local dev webhook
    (http://localhost:...) is storable but never dispatched."""
    if not url:
        return
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(
            status_code=400,
            detail="webhook_url must be an http(s) URL with a host",
        )


def create_product(request: ProductCreateRequest, db: Session) -> Product:
    cycles = validate_billing_cycles(request.billing_cycles)
    validate_webhook_url_scheme(request.webhook_url)
    # v3.0: notes are rejected while the notes feature is disabled.
    from services.settings import require_notes_enabled

    require_notes_enabled(db, request.notes)
    if request.status not in PRODUCT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {request.status} (expected one of {PRODUCT_STATUSES})",
        )
    slug = request.slug or slugify(request.name)
    if db.query(Product).filter(Product.slug == slug).first():
        raise HTTPException(status_code=400, detail=f"Product slug '{slug}' already exists")
    if request.group_id is not None:
        from models import ProductGroup

        if not db.query(ProductGroup).filter(ProductGroup.id == request.group_id).first():
            raise HTTPException(
                status_code=400, detail=f"Product group {request.group_id} not found"
            )
    product = Product(
        name=request.name,
        slug=slug,
        description=request.description,
        status=request.status,
        billing_cycles=json.dumps(cycles),
        webhook_url=request.webhook_url,
        webhook_events=json.dumps(request.webhook_events or []),
        webhook_secret=request.webhook_secret,
        group_id=request.group_id,
        key_prefix=(request.key_prefix or "").strip() or None,
        key_segments=request.key_segments,
        key_segment_length=request.key_segment_length,
        max_reissues=request.max_reissues,
        security_overrides=(
            json.dumps(request.security_overrides)
            if request.security_overrides is not None
            else None
        ),
        notes=request.notes,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_product(product_id: int, request: ProductUpdateRequest, db: Session) -> Product:
    product = get_product(product_id, db)
    if "notes" in request.model_fields_set:
        # v3.0: notes are rejected while the notes feature is disabled.
        from services.settings import require_notes_enabled

        require_notes_enabled(db, request.notes)
        product.notes = request.notes
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
    if request.status is not None:
        if request.status not in PRODUCT_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {request.status} (expected one of {PRODUCT_STATUSES})",
            )
        product.status = request.status
    if request.webhook_url is not None:
        validate_webhook_url_scheme(request.webhook_url)
        product.webhook_url = request.webhook_url
    if request.webhook_events is not None:
        product.webhook_events = json.dumps(request.webhook_events)
    if request.webhook_secret is not None:
        product.webhook_secret = request.webhook_secret
    # Nullable fields: an explicitly-sent null clears the value (e.g. a
    # product can be ungrouped). model_fields_set tells "sent" from "omitted".
    fields_set = request.model_fields_set
    if "group_id" in fields_set:
        if request.group_id is not None:
            from models import ProductGroup

            if not db.query(ProductGroup).filter(
                ProductGroup.id == request.group_id
            ).first():
                raise HTTPException(
                    status_code=400,
                    detail=f"Product group {request.group_id} not found",
                )
        product.group_id = request.group_id
    if "key_prefix" in fields_set:
        product.key_prefix = (request.key_prefix or "").strip() or None
    if request.key_segments is not None:
        product.key_segments = request.key_segments
    if request.key_segment_length is not None:
        product.key_segment_length = request.key_segment_length
    if "max_reissues" in fields_set:
        product.max_reissues = request.max_reissues
    if "security_overrides" in fields_set:
        # v2.3: per-product license-security overrides; null clears them.
        product.security_overrides = (
            json.dumps(request.security_overrides)
            if request.security_overrides is not None
            else None
        )
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
