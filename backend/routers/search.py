"""Global search route (v2.3): GET /api/search?q=..."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import SearchResponse
from services import search as search_service
from utils.auth import get_current_user

router = APIRouter()


@router.get("", response_model=SearchResponse)
def search(
    q: str = Query(default="", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search licenses (key/customer), products and users in one call."""
    return search_service.search_all(db, q, current_user)
