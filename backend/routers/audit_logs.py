"""Audit-log listing (v2.1, admin/manager only) + deletion (v3.0, admin only).

GET /api/audit-logs returns audit rows newest first, with skip/limit
pagination (X-Total-Count header) and optional ?entity= (exact match) and
?actor= (substring match on actor_email) filters.

DELETE /api/audit-logs/{id} removes one row; DELETE /api/audit-logs
removes all rows. Both require the "audit:delete" permission (admin
only in the built-in map). Deleting audit rows is deliberately NOT
audit-logged itself: logging a clear-all would immediately re-create a
row, and logging single deletes would be inconsistent for every caller.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
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
    # v3.0 per-channel filter for the Logs page tabs: email / sms /
    # telegram / twofa / system. Matches the action prefixes the
    # channel logs use (notify.<channel>_sent|failed, twofa.*,
    # service_status.*). Unknown values are rejected with 400.
    channel: str | None = Query(default=None),
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
    if channel is not None:
        prefixes = {
            "email": "notify.email_",
            "sms": "notify.sms_",
            "telegram": "notify.telegram_",
            "twofa": "twofa.",
            "system": "service_status.",
        }
        if channel not in prefixes:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown channel: {channel!r} (expected one of {sorted(prefixes)})",
            )
        query = query.filter(AuditLog.action.like(f"{prefixes[channel]}%", escape="\\"))
    return paginate_query(query.order_by(AuditLog.id.desc()), response, page)


@router.delete("/{log_id}", response_model=dict)
def delete_audit_log(
    log_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("audit:delete")),
):
    """Delete one audit row (admin only)."""
    row = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Audit log {log_id} not found")
    db.delete(row)
    db.commit()
    return {"message": f"Audit log {log_id} deleted successfully"}


@router.delete("", response_model=dict)
def clear_audit_logs(
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("audit:delete")),
):
    """Delete ALL audit rows (admin only, destructive)."""
    count = db.query(AuditLog).delete()
    db.commit()
    return {"message": f"Deleted {count} audit log(s)", "deleted": count}
