"""Public CAPTCHA endpoints (v3.0, no auth).

GET /api/captcha/config — what the login page needs (type, model,
site key, v3 threshold; never the secret).
POST /api/captcha/challenge — mint a single-use custom challenge.
The admin config lives at /api/settings/captcha-config (settings
router, settings:write), and verification happens inside the login
endpoint itself (services/captcha.verify_login_captcha).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import CaptchaChallengeResponse, CaptchaPublicConfigResponse
from services import captcha as captcha_service

router = APIRouter()


@router.get("/config", response_model=CaptchaPublicConfigResponse)
def get_public_config(db: Session = Depends(get_db)):
    """Public captcha config for the login page (no secret)."""
    return captcha_service.public_captcha_config(db)


@router.post("/challenge", response_model=CaptchaChallengeResponse)
def new_challenge(db: Session = Depends(get_db)):
    """Mint one single-use custom challenge (5-minute expiry)."""
    cfg = captcha_service.get_captcha_config(db)
    return captcha_service.generate_challenge(cfg["model"])
