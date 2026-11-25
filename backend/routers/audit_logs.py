"""Audit-log listing (v2.1, admin/manager only).

GET /api/audit-logs returns audit rows newest first, with skip/limit
pagination (X-Total-Count header) and optional ?entity= (exact match) and
?actor= (substring match on actor_email) filters.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from database import get_db
from models import AuditLog
from schemas import AuditLogResponse
from utils.pagination import Pagination, paginate_query, pagination_params
from utils.permissions import require_permission

router = APIRouter()


@router.get("", response_model=List[AuditLogResponse])
def list_audit_logs(
    response: Response,
    entity: Optional[str] = Query(default=None),
    actor: Optional[str] = Query(default=None),
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("audit:read")),
):
    """List audit rows, newest first."""
    query = db.query(AuditLog)
    if entity is not None:
        query = query.filter(AuditLog.entity == entity)
    if actor is not None:
        query = query.filter(AuditLog.actor_email.like(f"%{actor}%"))
    return paginate_query(query.order_by(AuditLog.id.desc()), response, page)
