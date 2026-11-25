"""Audit logging service.

Every mutating admin action records one AuditLog row (who did what, to
which entity, when). Logging must never break the operation it records:
a failure to write the audit row is logged and swallowed.
"""
import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from models import AuditLog

logger = logging.getLogger(__name__)


def log_audit(
    db: Session,
    actor_email: str,
    action: str,
    entity: str,
    entity_id: Optional[str],
    details: Optional[dict] = None,
) -> Optional[AuditLog]:
    """Record one audit row. ``details`` is stored as a JSON string."""
    row = AuditLog(
        actor_email=actor_email,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        details=json.dumps(details) if details is not None else None,
    )
    try:
        db.add(row)
        db.commit()
    except Exception as exc:  # noqa: BLE001 - audit must never break the caller
        db.rollback()
        logger.warning("Could not write audit log %s %s: %s", action, entity, exc)
        return None
    db.refresh(row)
    return row
