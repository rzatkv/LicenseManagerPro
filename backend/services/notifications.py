"""In-app notifications (v2.2).

`notify()` writes one row; user_id None means "all admins" (broadcast).
Notification writes must never break the operation that fires them, so
failures are logged and swallowed.
"""
import logging
from typing import Optional

from sqlalchemy.orm import Session

from models import Notification, User

logger = logging.getLogger(__name__)


def notify(
    db: Session,
    title: str,
    message: str,
    type_: str = "info",
    link: Optional[str] = None,
    user_id: Optional[int] = None,
) -> Optional[Notification]:
    row = Notification(
        title=title,
        message=message,
        type=type_,
        link=link,
        user_id=user_id,
    )
    try:
        db.add(row)
        db.commit()
    except Exception as exc:  # noqa: BLE001 - notifications must never break the caller
        db.rollback()
        logger.warning("Could not write notification %r: %s", title, exc)
        return None
    db.refresh(row)
    return row


def notify_admins(
    db: Session,
    title: str,
    message: str,
    type_: str = "info",
    link: Optional[str] = None,
) -> Optional[Notification]:
    """Broadcast to every admin (a NULL user_id row is shown to all admins)."""
    return notify(db, title, message, type_=type_, link=link, user_id=None)


def visible_notifications_query(db: Session, user: User):
    """Rows a user may see: broadcast rows (admins only) + their own rows."""
    query = db.query(Notification)
    if user.role == "admin":
        return query.filter(
            (Notification.user_id.is_(None)) | (Notification.user_id == user.id)
        )
    return query.filter(Notification.user_id == user.id)
