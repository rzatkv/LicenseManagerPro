"""SMS providers (v3.0) — ippanel, Kavenegar, Faraz SMS (Melipayamak).

Config is one JSON setting, `sms_config`:

    {"active_provider": "kavenegar" | "ippanel" | "faraz" | "",
     "providers": {"ippanel":   {"api_key": "...", "sender": "..."},
                   "kavenegar": {"api_key": "...", "sender": "..."},
                   "faraz":     {"username": "...", "password": "...",
                                 "sender": "..."}}}

There is a SINGLE `active_provider` field — not one boolean per
provider — so two providers can never be active at the same time:
enabling one overwrites the other by construction (see
`set_sms_config`). Credentials are server-side only: the public view
returns only `configured` flags, never the secrets.

Provider endpoints (documented, NOT tested against live accounts —
no keys exist in this repo):
- Kavenegar: POST https://api.kavenegar.com/v1/{apikey}/sms/send.json
  (form fields receptor, sender, message).
- ippanel: REAL Edge client in services/sms_ippanel.py (verified
  against github.com/ippanelcom/Edge-Document): POST
  https://edge.ippanel.com/v1/api/send with header
  ``Authorization: <raw API key>`` and body
  {"sending_type": "webservice", "from_number": ..., "message": ...,
  "params": {"recipients": [...]}}; credit via GET
  https://edge.ippanel.com/v1/api/payment/credit/mine. Older Mediana
  REST uses http://rest.ippanel.com/v1/messages (NOT used here).
- Faraz SMS / Melipayamak: POST
  https://rest.payamak-panel.com/api/SendSMS/SendSMS with JSON
  {username, password, to, from, text, isflash: false}.
"""
import json
import logging
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from services.settings import get_setting_default

logger = logging.getLogger(__name__)

PROVIDERS = ("ippanel", "kavenegar", "faraz")

# Fields each provider needs; used by the admin endpoint + Settings UI.
PROVIDER_FIELDS = {
    "ippanel": ("api_key", "sender"),
    "kavenegar": ("api_key", "sender"),
    "faraz": ("username", "password", "sender"),
}

_DEFAULT_CONFIG = {"active_provider": "", "providers": {p: {} for p in PROVIDERS}}


def get_sms_config(db: Session) -> dict:
    """Full config (server-side only; contains secrets)."""
    try:
        cfg = json.loads(get_setting_default(db, "sms_config", "{}") or "{}")
    except (ValueError, TypeError):
        cfg = {}
    merged = json.loads(json.dumps(_DEFAULT_CONFIG))
    merged.update(cfg)
    merged["providers"] = {
        **{p: {} for p in PROVIDERS},
        **(cfg.get("providers") or {}),
    }
    return merged


def public_sms_config(db: Session) -> dict:
    """What the admin UI may see: active provider + per-provider
    `configured` flags, never any credential."""
    cfg = get_sms_config(db)
    return {
        "active_provider": cfg.get("active_provider") or "",
        "providers": {
            name: {
                "configured": any(
                    (fields.get(f) or "").strip()
                    for f in PROVIDER_FIELDS[name]
                    if f != "sender"
                ),
                "sender": (fields.get("sender") or ""),
            }
            for name, fields in cfg["providers"].items()
        },
    }


def set_sms_config(db: Session, payload: dict) -> dict:
    """Merge an admin update into the stored config.

    `active_provider` is a single field: setting it to B deactivates A
    by construction. A payload that tries to activate two providers
    (e.g. {"active_provider": ["a", "b"]}) is rejected. Credentials
    already stored are kept when the payload omits them (empty string
    keeps the stored value); "__CLEAR__" removes a stored secret.
    """
    from services.settings import update_setting

    cfg = get_sms_config(db)
    active = payload.get("active_provider")
    if active is not None:
        if active not in ("", *PROVIDERS):
            raise ValueError(f"Unknown SMS provider: {active!r}")
        cfg["active_provider"] = active
    incoming = payload.get("providers") or {}
    for name, fields in incoming.items():
        if name not in PROVIDERS:
            raise ValueError(f"Unknown SMS provider: {name!r}")
        if not isinstance(fields, dict):
            raise ValueError(f"Provider {name!r} config must be an object")
        for field, value in fields.items():
            if field not in PROVIDER_FIELDS[name]:
                raise ValueError(f"Unknown field {field!r} for provider {name!r}")
            if value == "__CLEAR__":
                cfg["providers"][name].pop(field, None)
            elif value not in (None, ""):
                cfg["providers"][name][field] = str(value)
    update_setting(db, "sms_config", json.dumps(cfg))
    return public_sms_config(db)


def active_provider(db: Session) -> str:
    return get_sms_config(db).get("active_provider") or ""


def send_sms(db: Session, to: str, text: str) -> bool:
    """Send one SMS via the single active provider. Returns False when
    no provider is active/configured or the provider call fails (the
    failure is logged, never raised — callers must not break on it).
    `create_sms_client` exists so tests can monkeypatch the HTTP call.
    """
    cfg = get_sms_config(db)
    name = cfg.get("active_provider") or ""
    if name not in PROVIDERS:
        return False
    fields = cfg["providers"].get(name) or {}
    try:
        if name == "kavenegar":
            client = create_sms_client()
            resp = client.post(
                f"https://api.kavenegar.com/v1/{fields['api_key']}/sms/send.json",
                data={"receptor": to, "sender": fields.get("sender", ""), "message": text},
                timeout=15,
            )
            return resp.status_code == 200
        if name == "ippanel":
            # Real Edge client (services/sms_ippanel.py) — the endpoint,
            # auth header and body shape are pinned by the official
            # Edge reference; do not "simplify" them back.
            from services import sms_ippanel as ippanel

            try:
                ippanel.send_webservice(
                    fields["api_key"], fields.get("sender", ""), to, text
                )
            except ippanel.IppanelAuthError:
                logger.warning("SMS send via ippanel failed: API key rejected")
                return False
            except ippanel.IppanelError as exc:
                logger.warning("SMS send via ippanel failed: %s", exc)
                return False
            return True
        if name == "faraz":
            client = create_sms_client()
            resp = client.post(
                "https://rest.payamak-panel.com/api/SendSMS/SendSMS",
                json={
                    "username": fields["username"],
                    "password": fields["password"],
                    "to": to,
                    "from": fields.get("sender", ""),
                    "text": text,
                    "isflash": False,
                },
                timeout=15,
            )
            return resp.status_code == 200
    except KeyError:
        logger.warning("SMS provider %s is active but missing credentials", name)
        return False
    except Exception as exc:  # noqa: BLE001 - provider failure must not break callers
        logger.warning("SMS send via %s failed: %s", name, exc)
        return False
    return False


def create_sms_client() -> httpx.Client:
    """Factory for the HTTP client (monkeypatch point for tests)."""
    return httpx.Client(trust_env=False, timeout=15)
