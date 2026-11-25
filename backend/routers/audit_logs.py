"""Audit-log listing (v2.1, admin/manager only).

GET /api/audit-logs returns audit rows newest first, with skip/limit
pagination (X-Total-Count header) and optional ?entity= (exact match) and
?actor= (substring match on actor_email) filters.
"""

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from database import escape_like, get_db
from models import AuditLog
from schemas import AuditLogResponse
from utils.pagination import Pagination, paginate_query, pagination_params
from utils.permissions import require_permission

router = APIRouter()


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    response: Response,
    entity: str | None = Query(default=None),
    actor: str | None = Query(default=None),
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("audit:read")),
):
    """List audit rows, newest first."""
    query = db.query(AuditLog)
    if entity is not None:
        query = query.filter(AuditLog.entity == entity)
    if actor is not None:
        # Escape LIKE wildcards: the term is a literal string.
        query = query.filter(AuditLog.actor_email.like(f"%{escape_like(actor)}%", escape="\\"))
    return paginate_query(query.order_by(AuditLog.id.desc()), response, page)
