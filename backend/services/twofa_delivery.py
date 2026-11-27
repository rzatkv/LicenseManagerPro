"""2FA codes delivered by email or SMS (v3.0).

Extends TOTP (the authenticator-app channel) with two more channels,
chosen by the `twofa_channel` setting (totp | email | sms, default
totp). Codes are 6 digits, single-use, expire after 5 minutes, and
allow at most 5 verification attempts; everything is server-side and
in-memory (per-process, like the HMAC replay cache and the custom
captcha challenge store).

- email: sent via services.mail (SMTP from Settings → Email) using the
  `twofa_code` email template.
- sms: sent via services.sms using the single active SMS provider.
  The user needs a phone number (User.phone, editable in Profile);
  without one the send fails with a clear error.
"""
import secrets
import threading
import time

from sqlalchemy.orm import Session

from models import User

_CODE_TTL_SECONDS = 5 * 60
_MAX_ATTEMPTS = 5

_store: dict[int, dict] = {}
_lock = threading.Lock()


def _log_2fa_send(db: Session, channel: str, ok: bool, to: str) -> None:
    """Per-channel log (v3.0): every 2FA code send is recorded as
    `twofa.<channel>_sent|failed` so the Logs page can filter the 2FA
    stream. The code itself is NEVER logged."""
    from services.audit import log_audit

    log_audit(
        db,
        "system",
        f"twofa.{channel}_{'sent' if ok else 'failed'}",
        "notification",
        None,
        {"event": "twofa_code", "channel": channel, "to": to},
    )


def _generate_code() -> str:
    # v3.0.6 (security, L2): secrets, not random — random.Random is a
    # Mersenne Twister whose state is recoverable from observed outputs;
    # a 6-digit login code must be unpredictable.
    return f"{secrets.randbelow(1_000_000):06d}"


def send_code(db: Session, user: User, channel: str) -> tuple[bool, str | None]:
    """Send a fresh 6-digit code to `user` via `channel` ("email" or
    "sms"). Returns (ok, error): error is a human-readable string when
    the send could not happen (no email/SMS configured, no phone)."""
    if channel not in ("email", "sms"):
        return False, "Unknown 2FA channel"
    code = _generate_code()
    if channel == "email":
        from services import mail as mail_service
        from services.templates import render_template

        subject, body = render_template(
            db, "twofa_code", {"code": code, "user_email": user.email}
        )
        ok = mail_service.send_mail(db, user.email, subject, body)
        _log_2fa_send(db, "email", ok, user.email)
        if not ok:
            return False, "Email is not configured (Settings → Email)"
    else:
        if not (user.phone or "").strip():
            return False, "No phone number on this account (set it in Profile)"
        from services import sms as sms_service

        ok = sms_service.send_sms(
            db, user.phone, f"Your verification code is: {code}"
        )
        _log_2fa_send(db, "sms", ok, user.phone)
        if not ok:
            return False, "SMS is not configured (Settings → SMS)"
    with _lock:
        _store[user.id] = {
            "code": code,
            "expires_at": time.time() + _CODE_TTL_SECONDS,
            "attempts": 0,
        }
    return True, None


def verify_code(db: Session, user: User, code: str) -> bool:
    """Check a delivered code: single-use (consumed whatever the
    outcome), 5-minute TTL, max 5 attempts. Returns False on any
    failure — expired, unknown, reused, or too many attempts."""
    with _lock:
        entry = _store.pop(user.id, None)
    if entry is None:
        return False
    if time.time() > entry["expires_at"]:
        return False
    if entry["attempts"] >= _MAX_ATTEMPTS:
        return False
    entry["attempts"] += 1
    if (code or "").strip() != entry["code"]:
        # Wrong code: put the entry back (attempts count) unless the
        # limit is now reached.
        if entry["attempts"] < _MAX_ATTEMPTS:
            with _lock:
                _store[user.id] = entry
        return False
    return True


def pending_code_for(user_id: int) -> str | None:
    """Test helper: the currently pending code for a user (None when
    there is none). Not an API — tests import this directly."""
    with _lock:
        entry = _store.get(user_id)
    if entry is None or time.time() > entry["expires_at"]:
        return None
    return entry["code"]
