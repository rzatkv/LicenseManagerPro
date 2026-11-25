"""Product routes (v2.0, all require a JWT; writes need products:write).

v2.3: the read endpoints also accept a module-scoped API key
(products:read) so WHMCS/WooCommerce can load the product list for the
settings dropdown. Writes stay JWT-only.
"""

from fastapi import APIRouter, Depends, Query, Response
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
from services.audit import log_audit
from utils.module_auth import require_actor
from utils.pagination import Pagination, paginate_list, pagination_params
from utils.permissions import require_permission

router = APIRouter()

_write = require_permission("products:write")


@router.get("", response_model=list[ProductResponse])
def list_products(
    response: Response,
    status: str | None = Query(default=None),
    group_id: int | None = Query(default=None),
    slug: str | None = Query(default=None, description="Exact product slug lookup"),
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    _actor=Depends(require_actor(jwt_perm=None, module_scope="products:read")),
):
    products = product_service.list_products(
        db, status=status, group_id=group_id, slug=slug
    )
    return paginate_list(
        [product_service.serialize_product(p) for p in products], response, page
    )


@router.post("", response_model=ProductResponse, status_code=201)
def create_product(
    request: ProductCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(_write),
):
    product = product_service.create_product(request, db)
    log_audit(
        db,
        current_user.email,
        "product.create",
        "product",
        product.id,
        {"slug": product.slug, "name": product.name},
    )
    return product_service.serialize_product(product)


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    _actor=Depends(require_actor(jwt_perm=None, module_scope="products:read")),
):
    product = product_service.get_product(product_id, db)
    return product_service.serialize_product(product)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    request: ProductUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(_write),
):
    product = product_service.update_product(product_id, request, db)
    log_audit(
        db,
        current_user.email,
        "product.update",
        "product",
        product.id,
        {"slug": product.slug},
    )
    return product_service.serialize_product(product)


@router.delete("/{product_id}", response_model=MessageResponse)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(_write),
):
    product_service.delete_product(product_id, db)
    log_audit(db, current_user.email, "product.delete", "product", product_id)
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
