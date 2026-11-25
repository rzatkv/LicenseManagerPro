"""Custom-language storage (v2.0): user-added languages for the Language
Management page. Built-in en/fa live in the frontend, not in this table."""
import json

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import CustomLanguage


def serialize_language(language: CustomLanguage, full: bool = False) -> dict:
    data = {"code": language.code, "name": language.name}
    if full:
        try:
            data["translations"] = json.loads(language.translations or "{}")
        except (TypeError, ValueError):
            data["translations"] = {}
    return data


def list_languages(db: Session):
    return db.query(CustomLanguage).order_by(CustomLanguage.code).all()


def get_language(code: str, db: Session) -> CustomLanguage:
    language = db.query(CustomLanguage).filter(CustomLanguage.code == code).first()
    if not language:
        raise HTTPException(status_code=404, detail=f"Language '{code}' not found")
    return language


def upsert_language(code: str, name: str, translations: dict, db: Session) -> CustomLanguage:
    language = db.query(CustomLanguage).filter(CustomLanguage.code == code).first()
    if language is None:
        language = CustomLanguage(
            code=code, name=name, translations=json.dumps(translations or {})
        )
        db.add(language)
    else:
        language.name = name
        language.translations = json.dumps(translations or {})
    db.commit()
    db.refresh(language)
    return language


def delete_language(code: str, db: Session) -> None:
    language = get_language(code, db)
    db.delete(language)
    db.commit()
