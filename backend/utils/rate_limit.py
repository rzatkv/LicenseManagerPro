"""In-memory sliding-window rate limiter (no new dependencies).

One deque of request timestamps per (endpoint, client IP) key, 60-second
window. Limits are read from ``config`` at request time so tests can
monkeypatch them. The store is resettable from tests via
:func:`reset_rate_limits`.
"""
import time
from collections import deque

from fastapi import HTTPException, Request

import config

WINDOW_SECONDS = 60.0

# Failed-login tracking (brute-force protection): per (lowercased) email,
# 5 failures inside 15 minutes lock the account for 15 minutes. The
# lockout applies to unknown emails too, so it reveals nothing about
# whether an account exists.
LOGIN_LOCKOUT_WINDOW_SECONDS = 900.0
LOGIN_LOCKOUT_MAX_FAILURES = 5

_hits: dict[str, deque[float]] = {}
_failed_logins: dict[str, deque[float]] = {}


def reset_rate_limits() -> None:
    """Clear all recorded hits (used by tests to isolate cases)."""
    _hits.clear()
    _failed_logins.clear()


def is_login_locked(email: str) -> bool:
    """True when this email has too many recent failed logins."""
    key = (email or "").strip().lower()
    failures = _failed_logins.get(key)
    if not failures:
        return False
    now = time.monotonic()
    while failures and failures[0] <= now - LOGIN_LOCKOUT_WINDOW_SECONDS:
        failures.popleft()
    return len(failures) >= LOGIN_LOCKOUT_MAX_FAILURES


def record_failed_login(email: str) -> None:
    """Record one failed login attempt for the lockout tracker."""
    key = (email or "").strip().lower()
    _failed_logins.setdefault(key, deque()).append(time.monotonic())


# Alias: both names are used in the codebase/tests.
clear_rate_limits = reset_rate_limits


def _key(request: Request, name: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{name}:{ip}"


def _check(key: str, limit: int) -> None:
    now = time.monotonic()
    window = _hits.setdefault(key, deque())
    while window and window[0] <= now - WINDOW_SECONDS:
        window.popleft()
    if len(window) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Too many requests, please try again later",
        )
    window.append(now)


def rate_limit_auth(request: Request) -> None:
    """FastAPI dependency: limit auth attempts (login/register)."""
    _check(_key(request, "auth"), config.RATE_LIMIT_AUTH_PER_MINUTE)


def rate_limit_validate(request: Request) -> None:
    """FastAPI dependency: limit license/key validation calls."""
    _check(_key(request, "validate"), config.RATE_LIMIT_VALIDATE_PER_MINUTE)


def rate_limit_captcha(request: Request) -> None:
    """FastAPI dependency: limit unauthenticated challenge minting
    (v3.0.6, security L3) — without it an attacker could grow the
    in-memory challenge store without bound."""
    _check(_key(request, "captcha"), config.RATE_LIMIT_CAPTCHA_PER_MINUTE)


def rate_limit_2fa(request: Request) -> None:
    """FastAPI dependency: stricter limit for the 2FA code exchange
    (5/min per IP) — TOTP codes must not be brute-forceable."""
    _check(_key(request, "2fa"), config.RATE_LIMIT_2FA_PER_MINUTE)
