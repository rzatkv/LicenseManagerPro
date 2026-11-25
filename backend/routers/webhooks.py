"""Webhook delivery listing (v2.0, JWT required)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import WebhookDelivery
from schemas import WebhookDeliveryResponse
from utils.auth import get_current_user

router = APIRouter()


@router.get("/deliveries", response_model=List[WebhookDeliveryResponse])
def list_deliveries(
    product_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """List recorded webhook delivery attempts, newest first."""
    query = db.query(WebhookDelivery)
    if product_id is not None:
        query = query.filter(WebhookDelivery.product_id == product_id)
    return query.order_by(WebhookDelivery.id.desc()).limit(limit).all()
