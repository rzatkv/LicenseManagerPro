"""Webhook delivery listing (v2.0, JWT required)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from database import get_db
from models import WebhookDelivery
from schemas import WebhookDeliveryResponse
from utils.auth import get_current_user
from utils.pagination import Pagination, paginate_query, pagination_params

router = APIRouter()


@router.get("/deliveries", response_model=List[WebhookDeliveryResponse])
def list_deliveries(
    response: Response,
    product_id: Optional[int] = Query(default=None),
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """List recorded webhook delivery attempts, newest first."""
    query = db.query(WebhookDelivery)
    if product_id is not None:
        query = query.filter(WebhookDelivery.product_id == product_id)
    return paginate_query(query.order_by(WebhookDelivery.id.desc()), response, page)
