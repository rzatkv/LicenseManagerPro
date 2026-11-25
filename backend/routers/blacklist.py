"""Blacklist routes (v2.2; admin only)."""

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from database import get_db
from models import BlacklistEntry, User
from schemas import BlacklistCreateRequest, BlacklistResponse, MessageResponse
from services import blacklist as blacklist_service
from services.audit import log_audit
from utils.auth import require_admin
from utils.pagination import Pagination, paginate_list, pagination_params

router = APIRouter()


def _serialize(entry: BlacklistEntry) -> dict:
    return {
        "id": entry.id,
        "type": entry.type,
        "value": entry.value,
        "reason": entry.reason,
        "created_by": entry.created_by,
        "created_at": entry.created_at,
    }


@router.get("", response_model=list[BlacklistResponse])
def list_blacklist(
    response: Response,
    type: str | None = Query(default=None, description="ip or domain"),
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    query = db.query(BlacklistEntry)
    if type is not None:
        if type not in ("ip", "domain"):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=400, detail="type must be ip or domain"
            )
        query = query.filter(BlacklistEntry.type == type)
    entries = query.order_by(BlacklistEntry.created_at.desc()).all()
    return paginate_list([_serialize(e) for e in entries], response, page)


@router.post("", response_model=BlacklistResponse, status_code=201)
def create_entry(
    request: BlacklistCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    blacklist_service.validate_entry_value(request.type, request.value)
    value = request.value.strip()
    if (
        db.query(BlacklistEntry)
        .filter(BlacklistEntry.type == request.type, BlacklistEntry.value == value)
        .first()
    ):
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400, detail=f"'{value}' is already blacklisted"
        )
    entry = BlacklistEntry(
        type=request.type,
        value=value,
        reason=(request.reason or "").strip() or None,
        created_by=current_user.email,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    log_audit(
        db, current_user.email, "blacklist.create", "blacklist", entry.id,
        {"type": entry.type, "value": entry.value},
    )
    return _serialize(entry)


@router.delete("/{entry_id}", response_model=MessageResponse)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    entry = db.query(BlacklistEntry).filter(BlacklistEntry.id == entry_id).first()
    if not entry:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Blacklist entry not found")
    db.delete(entry)
    db.commit()
    log_audit(db, current_user.email, "blacklist.delete", "blacklist", entry_id)
    return {"message": "Blacklist entry deleted successfully"}
