"""In-memory sliding-window rate limiter (no new dependencies).

One deque of request timestamps per (endpoint, client IP) key, 60-second
window. Limits are read from ``config`` at request time so tests can
monkeypatch them. The store is resettable from tests via
:func:`reset_rate_limits`.
"""
import time
from collections import deque
from typing import Deque

from fastapi import HTTPException, Request

import config

WINDOW_SECONDS = 60.0

_hits: dict[str, Deque[float]] = {}


def reset_rate_limits() -> None:
    """Clear all recorded hits (used by tests to isolate cases)."""
    _hits.clear()


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
