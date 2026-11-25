"""Notification routes (v2.2; JWT).

Admins see broadcast notifications (user_id NULL) plus their own; other
roles see only notifications addressed to them.
"""
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from database import get_db
from models import Notification, User
from schemas import MessageResponse, NotificationResponse, NotificationsListResponse
from services import notifications as notification_service
from utils.auth import get_current_user
from utils.pagination import Pagination, pagination_params

router = APIRouter()


def _serialize(row: Notification) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "title": row.title,
        "message": row.message,
        "type": row.type,
        "link": row.link,
        "is_read": row.is_read,
        "created_at": row.created_at,
    }


@router.get("", response_model=NotificationsListResponse)
def list_notifications(
    response: Response,
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = notification_service.visible_notifications_query(db, current_user)
    total = query.count()
    unread = query.filter(Notification.is_read.is_(False)).count()
    rows = (
        query.order_by(Notification.is_read, Notification.created_at.desc())
        .offset(page.skip)
        .limit(page.limit)
        .all()
    )
    response.headers["X-Total-Count"] = str(total)
    return {
        "total": total,
        "unread": unread,
        "notifications": [_serialize(r) for r in rows],
    }


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        notification_service.visible_notifications_query(db, current_user)
        .filter(Notification.id == notification_id)
        .first()
    )
    if not row:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Notification not found")
    row.is_read = True
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.post("/read-all", response_model=MessageResponse)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = notification_service.visible_notifications_query(db, current_user)
    count = query.filter(Notification.is_read.is_(False)).update(
        {"is_read": True}, synchronize_session=False
    )
    db.commit()
    return {"message": f"{count} notification(s) marked as read"}
