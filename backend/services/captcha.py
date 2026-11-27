"""CAPTCHA (v3.0): custom challenges + Google reCAPTCHA v2/v3, login guard.

Custom models (all generated and verified SERVER-SIDE, offline):
  - "math":    a small addition/subtraction, e.g. "7 + 5 = ?"
  - "text":    a 5-character code rendered with CSS distortion on the
              login page (unambiguous alphabet, no 0/O/1/I/l)
  - "reverse": a 4-digit number the user types back in reverse order

Every challenge is single-use and expires after CHALLENGE_TTL_SECONDS
(5 minutes). Google reCAPTCHA v2 (checkbox) and v3 (invisible, score)
are verified against Google's siteverify API; a network failure fails
CLOSED (no login). The secret key is stored in the `captcha_config`
system setting and is NEVER returned by any endpoint (the admin config
endpoint reports only `secret_configured: true/false`).

Default: captcha OFF, so existing logins keep working until an admin
enables it in Settings → Security.
"""
import json
import logging
import secrets
import string
import threading
import time

import httpx
from sqlalchemy.orm import Session

from services.settings import get_setting_default, update_setting

logger = logging.getLogger(__name__)

CHALLENGE_TTL_SECONDS = 300
RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"
RECAPTCHA_TIMEOUT_SECONDS = 10

CAPTCHA_TYPES = ("off", "custom", "recaptcha-v2", "recaptcha-v3")
CUSTOM_MODELS = ("math", "text", "reverse")
DEFAULT_V3_THRESHOLD = 0.5

DEFAULT_CONFIG = {
    "type": "off",
    "model": "math",
    "site_key": "",
    "secret_key": "",
    "v3_threshold": DEFAULT_V3_THRESHOLD,
}

# In-memory single-use challenges: {challenge_id: (answer, expires_at)}.
# Per-process, like the module-key HMAC replay cache — a multi-worker
# deployment would need a shared store; a challenge is cheap to re-issue.
_challenges: dict[str, tuple[str, float]] = {}
_challenges_lock = threading.Lock()

_TEXT_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/l


def _parse_config(raw: str | None) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if raw:
        try:
            stored = json.loads(raw)
            if isinstance(stored, dict):
                cfg.update({k: v for k, v in stored.items() if k in DEFAULT_CONFIG})
        except (ValueError, TypeError):
            pass
    if cfg.get("type") not in CAPTCHA_TYPES:
        cfg["type"] = "off"
    if cfg.get("model") not in CUSTOM_MODELS:
        cfg["model"] = "math"
    try:
        cfg["v3_threshold"] = float(cfg.get("v3_threshold", DEFAULT_V3_THRESHOLD))
    except (TypeError, ValueError):
        cfg["v3_threshold"] = DEFAULT_V3_THRESHOLD
    cfg["v3_threshold"] = min(1.0, max(0.0, cfg["v3_threshold"]))
    return cfg


def get_captcha_config(db: Session) -> dict:
    """Full config INCLUDING the secret (server-side use only)."""
    return _parse_config(get_setting_default(db, "captcha_config", ""))


def public_captcha_config(db: Session) -> dict:
    """What the login page may know: type, model, site key, threshold —
    never the secret."""
    cfg = get_captcha_config(db)
    return {
        "type": cfg["type"],
        "model": cfg["model"],
        "site_key": cfg["site_key"] if cfg["type"] in ("recaptcha-v2", "recaptcha-v3") else "",
        "v3_threshold": cfg["v3_threshold"],
        "secret_configured": bool(cfg["secret_key"]),
    }


def set_captcha_config(db: Session, patch: dict) -> dict:
    """Validate and store an admin-supplied config patch. An empty secret
    keeps the stored one (the frontend sends "" when it was not changed);
    the literal string "__CLEAR__" removes it."""
    current = get_captcha_config(db)
    merged = dict(current)
    if "type" in patch and patch["type"] is not None:
        if patch["type"] not in CAPTCHA_TYPES:
            raise ValueError("captcha type must be off, custom, recaptcha-v2 or recaptcha-v3")
        merged["type"] = patch["type"]
    if "model" in patch and patch["model"] is not None:
        if patch["model"] not in CUSTOM_MODELS:
            raise ValueError("captcha model must be math, text or reverse")
        merged["model"] = patch["model"]
    if "site_key" in patch and patch["site_key"] is not None:
        merged["site_key"] = str(patch["site_key"])[:200]
    if "secret_key" in patch and patch["secret_key"] is not None:
        if patch["secret_key"] == "__CLEAR__":
            merged["secret_key"] = ""
        elif patch["secret_key"] != "":
            merged["secret_key"] = str(patch["secret_key"])[:500]
    if "v3_threshold" in patch and patch["v3_threshold"] is not None:
        try:
            merged["v3_threshold"] = min(1.0, max(0.0, float(patch["v3_threshold"])))
        except (TypeError, ValueError):
            raise ValueError("v3_threshold must be a number between 0 and 1") from None
    update_setting(db, "captcha_config", json.dumps(merged))
    return public_captcha_config(db)


def generate_challenge(model: str) -> dict:
    """Create a single-use challenge. Returns the public challenge (the
    answer stays server-side in _challenges)."""
    if model not in CUSTOM_MODELS:
        model = "math"
    challenge_id = secrets.token_urlsafe(18)
    if model == "math":
        a = secrets.randbelow(18) + 2
        b = secrets.randbelow(18) + 2
        if secrets.randbelow(2) == 0:
            display, answer = f"{a} + {b} = ?", str(a + b)
        else:
            display, answer = f"{a + b} - {a} = ?", str(b)
        prompt = "Solve the calculation"
    elif model == "text":
        code = "".join(secrets.choice(_TEXT_ALPHABET) for _ in range(5))
        display, answer = " ".join(code), code
        prompt = "Type the characters shown"
    else:  # reverse
        digits = "".join(str(secrets.randbelow(10)) for _ in range(4))
        display, answer = digits, digits[::-1]
        prompt = "Type these digits in reverse order"
    now = time.time()
    with _challenges_lock:
        # v3.0.6 (security, L3): the store only shrank when a challenge
        # was verified, so expired entries accumulated forever. Prune
        # them on every mint — the store now holds only live challenges.
        for cid in [c for c, (_, exp) in _challenges.items() if exp <= now]:
            del _challenges[cid]
        _challenges[challenge_id] = (answer, now + CHALLENGE_TTL_SECONDS)
    return {"challenge_id": challenge_id, "model": model, "prompt": prompt, "display": display}


def verify_custom_challenge(challenge_id: str | None, answer: str | None) -> bool:
    """Single-use: the challenge is consumed whatever the outcome, and an
    expired or unknown id fails."""
    if not challenge_id or answer is None:
        return False
    with _challenges_lock:
        stored = _challenges.pop(challenge_id, None)
    if stored is None:
        return False
    expected, expires_at = stored
    if time.time() > expires_at:
        return False
    # Text codes are case-insensitive; math/reverse answers are digits.
    # Whitespace is ignored (the text code is displayed spaced out).
    import re as _re

    return _re.sub(r"\s+", "", str(answer)).lower() == _re.sub(
        r"\s+", "", expected
    ).lower()


def create_recaptcha_client(timeout: float = RECAPTCHA_TIMEOUT_SECONDS) -> httpx.Client:
    """Module-level factory so tests can monkeypatch it with a
    MockTransport client instead of hitting Google."""
    return httpx.Client(timeout=timeout, trust_env=False)


def verify_recaptcha(secret: str, token: str | None, v3_threshold: float) -> bool:
    """Verify a reCAPTCHA token with Google. v2 needs success=true; v3
    additionally needs score >= threshold. Any failure (network, bad
    secret, low score) fails CLOSED."""
    if not secret or not token:
        return False
    try:
        with create_recaptcha_client() as client:
            resp = client.post(
                RECAPTCHA_VERIFY_URL,
                data={"secret": secret, "response": token},
            )
        data = resp.json()
    except Exception as exc:  # noqa: BLE001 - any transport failure fails closed
        logger.warning("reCAPTCHA verify failed: %s", exc)
        return False
    if not data.get("success"):
        return False
    if v3_threshold is not None:
        score = data.get("score")
        if score is None:
            return False
        try:
            if float(score) < float(v3_threshold):
                return False
        except (TypeError, ValueError):
            return False
    return True


def verify_login_captcha(db: Session, payload) -> tuple[bool, str | None]:
    """Verify the captcha fields of a login attempt against the stored
    config. Returns (ok, error-message-or-None). With captcha off this
    always passes."""
    cfg = get_captcha_config(db)
    captcha_type = cfg["type"]
    if captcha_type == "off":
        return True, None
    if captcha_type == "custom":
        ok = verify_custom_challenge(
            getattr(payload, "captcha_challenge_id", None),
            getattr(payload, "captcha_answer", None),
        )
        return ok, None if ok else "Captcha verification failed"
    # reCAPTCHA v2 / v3: the token comes from the Google widget.
    token = getattr(payload, "captcha_token", None)
    if not token:
        return False, "Captcha verification failed"
    threshold = cfg["v3_threshold"] if captcha_type == "recaptcha-v3" else None
    ok = verify_recaptcha(cfg["secret_key"], token, threshold)
    return ok, None if ok else "Captcha verification failed"
