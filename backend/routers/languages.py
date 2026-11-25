"""Custom-language routes (v2.0, JWT required).

Built-in en/fa live in the frontend, not in this table.
"""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    CustomLanguageListItem,
    CustomLanguageResponse,
    CustomLanguageUpsertRequest,
    MessageResponse,
)
from services import languages as language_service
from utils.auth import get_current_user
from utils.pagination import Pagination, paginate_list, pagination_params
from utils.permissions import require_permission

router = APIRouter()


@router.get("", response_model=list[CustomLanguageListItem])
def list_languages(
    response: Response,
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """List custom languages (code + name only)."""
    return paginate_list(
        [
            language_service.serialize_language(lang)
            for lang in language_service.list_languages(db)
        ],
        response,
        page,
    )


@router.get("/{code}", response_model=CustomLanguageResponse)
def get_language(
    code: str,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    language = language_service.get_language(code, db)
    return language_service.serialize_language(language, full=True)


@router.put("/{code}", response_model=CustomLanguageResponse)
def upsert_language(
    code: str,
    request: CustomLanguageUpsertRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("languages:write")),
):
    """Create or update a custom language."""
    language = language_service.upsert_language(
        code, request.name, request.translations, db
    )
    return language_service.serialize_language(language, full=True)


@router.delete("/{code}", response_model=MessageResponse)
def delete_language(
    code: str,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("languages:write")),
):
    language_service.delete_language(code, db)
    return {"message": f"Language '{code}' deleted successfully"}
