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
from utils.permissions import require_permission

router = APIRouter()


class SmsTestRequest(BaseModel):
    to: str = Field(..., min_length=3, max_length=32)
    message: str = Field(
        default="Test SMS from LicenseManagerPro — your SMS provider is connected.",
        max_length=500,
    )
    # v3.0.7: optional event — the test then exercises exactly what that
    # event would send: the pattern path (with sample params) when
    # ippanel is active and a pattern code is set for the event, else
    # the editable SMS text for that event with sample values.
    event: str | None = Field(default=None, max_length=64)


@router.get("/balance")
def get_sms_balance(
    refresh: bool = False,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission("sms:read")),
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
    current_user: User = Depends(require_permission("*")),
):
    """Send a REAL test SMS via the active provider (admin settings).

    v3.0.6 (security, M3): admin-only. It used to require only
    ``sms:write``, which managers hold — any manager could send an
    arbitrary SMS to any number at the owner's expense. A manager who
    needs to verify the provider can read the balance (sms:read).

    400 when no provider is active. The result is honest: ``sent``
    is True only when the provider call succeeded. ``mode`` reports
    which path the test took: "pattern" (ippanel pattern send with
    sample params) or "webservice" (free text).
    """
    from services import notify_channels as notify_channels_service
    from services.settings import get_setting_default

    provider = sms_service.active_provider(db)
    if not provider:
        raise HTTPException(status_code=400, detail="No SMS provider is active")
    mode = "webservice"
    pattern_code = ""
    if payload.event is not None:
        if payload.event not in notify_channels_service.EVENTS:
            raise HTTPException(
                status_code=400, detail=f"Unknown notification event: {payload.event!r}"
            )
        code = notify_channels_service.get_ippanel_patterns(db).get(payload.event, "")
        if provider == "ippanel" and code:
            # Pattern path: sample params, exactly what the event
            # would send.
            params = notify_channels_service.sample_pattern_params(payload.event)
            sent = sms_service.send_pattern_sms(db, payload.to, code, params)
            mode = "pattern"
            pattern_code = code
        else:
            # Free-text path: the editable SMS text for this event,
            # rendered with the same sample values the UI preview uses.
            site = get_setting_default(db, "site_name", "License Manager Pro")
            text = notify_channels_service.render_notification_text(
                notify_channels_service.get_notification_texts(db)[payload.event]["sms"],
                notify_channels_service.SAMPLE_PATTERN_TITLE,
                notify_channels_service.SAMPLE_PATTERN_MESSAGE,
                {
                    "site_name": site,
                    **notify_channels_service.SAMPLE_PATTERN_CONTEXT.get(payload.event, {}),
                },
                f"{notify_channels_service.SAMPLE_PATTERN_TITLE}: "
                f"{notify_channels_service.SAMPLE_PATTERN_MESSAGE}",
            )
            sent = sms_service.send_sms(db, payload.to, text)
    else:
        sent = sms_service.send_sms(db, payload.to, payload.message)
    details = {
        "event": "sms_test",
        "channel": "sms",
        "to": payload.to,
        "mode": mode,
    }
    if mode == "pattern":
        details["pattern_code"] = pattern_code
    if payload.event is not None:
        details["test_event"] = payload.event
    log_audit(
        db,
        "system",
        f"notify.sms_{'sent' if sent else 'failed'}",
        "notification",
        None,
        details,
    )
    return {"sent": sent, "provider": provider, "mode": mode, "event": payload.event}
