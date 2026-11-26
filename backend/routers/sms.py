"""SMS routes (v3.0). Mounted at /api/sms.

- ``GET /api/sms/balance`` — admin-only: the ippanel credit balance
  (Edge: ``GET /api/payment/credit/mine`` — see services/sms_ippanel.py
  for the verified reference). Result is cached ~5 minutes per API key;
  ``?refresh=1`` forces a live call. When no ippanel key is configured
  the response says so (``configured: false``) instead of erroring.
  Failures degrade to ``available: false`` with an ``error`` code —
  the widget shows "unavailable", never a fake balance.
- ``POST /api/sms/test`` — sends a REAL test SMS via the single active
  provider to the given number (``{"to": ..., "message"?}``). Returns
  ``{"sent": bool, "provider": ...}``. The attempt is logged as a
  ``notify.sms_sent`` / ``notify.sms_failed`` entry (event "sms_test")
  so it appears in the Logs page's SMS filter and the sending charts.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User
from services import sms as sms_service
from services import sms_ippanel as ippanel
from services.audit import log_audit
from utils.auth import require_admin
from utils.permissions import require_permission

router = APIRouter()


class SmsTestRequest(BaseModel):
    to: str = Field(..., min_length=3, max_length=32)
    message: str = Field(
        default="Test SMS from LicenseManagerPro — your SMS provider is connected.",
        max_length=500,
    )


@router.get("/balance")
def get_sms_balance(
    refresh: bool = False,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """IPPanel credit balance (admin-only).

    ``credit`` is the raw number from ippanel's ``data.credit``; the
    Edge docs name no currency unit for it — ippanel accounts are
    Rial-denominated, so ``unit`` is reported as "rial" (convention,
    not a value from the API).
    """
    cfg = sms_service.get_sms_config(db)
    fields = (cfg.get("providers") or {}).get("ippanel") or {}
    api_key = (fields.get("api_key") or "").strip()
    base = {
        "provider": "ippanel",
        "configured": bool(api_key),
        "active": cfg.get("active_provider") == "ippanel",
        "available": False,
        "credit": None,
        "unit": "rial",
        "checked_at": None,
        "cached": False,
        "error": None,
    }
    if not api_key:
        return {**base, "error": "not_configured"}
    try:
        result = ippanel.get_credit_cached(api_key, force=refresh)
    except ippanel.IppanelAuthError:
        return {**base, "error": "auth_failed"}
    except Exception:  # noqa: BLE001 - any provider failure degrades honestly
        return {**base, "error": "unavailable"}
    return {
        **base,
        "available": True,
        "credit": result["credit"],
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "cached": bool(result.get("_cached")),
    }


@router.post("/test")
def test_sms(
    payload: SmsTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("settings:write")),
):
    """Send a REAL test SMS via the active provider (admin settings).

    400 when no provider is active. The result is honest: ``sent``
    is True only when the provider call succeeded.
    """
    provider = sms_service.active_provider(db)
    if not provider:
        raise HTTPException(status_code=400, detail="No SMS provider is active")
    sent = sms_service.send_sms(db, payload.to, payload.message)
    log_audit(
        db,
        "system",
        f"notify.sms_{'sent' if sent else 'failed'}",
        "notification",
        None,
        {"event": "sms_test", "channel": "sms", "to": payload.to},
    )
    return {"sent": sent, "provider": provider}
