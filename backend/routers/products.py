"""Product routes (v2.0, all require a JWT; writes need products:write)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    MessageResponse,
    ProductCreateRequest,
    ProductResponse,
    ProductUpdateRequest,
    TestWebhookResponse,
)
from services import products as product_service
from services import webhooks as webhook_service
from utils.auth import get_current_user
from utils.permissions import require_permission

router = APIRouter()

_write = require_permission("products:write")


@router.get("", response_model=List[ProductResponse])
def list_products(
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    products = product_service.list_products(db, status=status)
    return [product_service.serialize_product(p) for p in products]


@router.post("", response_model=ProductResponse, status_code=201)
def create_product(
    request: ProductCreateRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(_write),
):
    product = product_service.create_product(request, db)
    return product_service.serialize_product(product)


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    product = product_service.get_product(product_id, db)
    return product_service.serialize_product(product)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    request: ProductUpdateRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(_write),
):
    product = product_service.update_product(product_id, request, db)
    return product_service.serialize_product(product)


@router.delete("/{product_id}", response_model=MessageResponse)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(_write),
):
    product_service.delete_product(product_id, db)
    return {"message": "Product deleted successfully"}


@router.post("/{product_id}/test-webhook", response_model=TestWebhookResponse)
def test_webhook(
    product_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(_write),
):
    """Send a {event: "license.test"} payload to the product's webhook_url."""
    product = product_service.get_product(product_id, db)
    if not product.webhook_url:
        return {"success": False, "status_code": None}
    delivery = webhook_service.dispatch_webhook(
        db,
        product,
        webhook_service.EVENT_TEST,
        {"event": webhook_service.EVENT_TEST, "product_slug": product.slug},
    )
    if delivery is None:
        return {"success": False, "status_code": None}
    return {"success": delivery.success, "status_code": delivery.status_code}
