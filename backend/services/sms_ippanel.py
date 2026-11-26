"""IPPanel Edge API client (v3.0) — REAL HTTP calls, no mocking in prod.

Verified against the authoritative reference, github.com/ippanelcom/
Edge-Document (public, main, commit 14fd969) — read from the repo's
``docs/`` directory (``docs/auth/index.md``, ``docs/send/webservice.md``,
``docs/send/pattern.md``, ``docs/payment/my-credit.md``):

- Base URL: ``https://edge.ippanel.com/v1`` (every endpoint).
- Auth: API key from the user panel (Developers → Access Keys), sent as
  a RAW ``Authorization: <token>`` header — no "AccessKey"/"Bearer"
  prefix (that prefix belongs to the OLD Mediana REST API).
- Send (webservice): ``POST /api/send`` with
  ``{"sending_type": "webservice", "from_number": "<E.164>",
  "message": "...", "params": {"recipients": [...]}}``.
- Send (pattern): ``POST /api/send`` with
  ``{"sending_type": "pattern", "from_number": "...",
  "code": "<pattern code>", "recipients": [<ONE number>],
  "params": {...}}``.
- Credit: ``GET /api/payment/credit/mine`` → ``data.credit`` (float),
  plus ``yesterday_credit``, ``gift``, ``gift_expires_at``,
  ``updated_at``.
- Envelopes: success ``meta.status=true`` + ``message_code "200-1"``;
  a send returns ``data.message_outbox_ids``. Invalid/expired key
  (HTTP 401) → ``meta.status=false``, ``message_code "400-1"``.
  Invalid request (HTTP 422) → ``message_code "400-2"`` + ``errors``.

This module REPLACES the old ippanel branch that lived in
``services/sms.py``: that branch used ``POST
https://edge.ippanel.com/v1/api/sms/send`` with an ``AccessKey`` auth
header and a ``{sending_number, recipients, message}`` body — path,
auth scheme AND body shape all contradict the repo. Do not reintroduce
them.

The API key is NEVER logged (not even truncated) and never leaves the
server: it comes from the stored SMS settings and is only ever sent to
``edge.ippanel.com`` in the Authorization header. Every call has a
short timeout (15s); failures raise — callers that must not break
(``send_sms``, the balance endpoint, the service-status check) catch
and degrade honestly instead of faking success.
"""
import logging
import time

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://edge.ippanel.com/v1"
SEND_PATH = "/api/send"
CREDIT_PATH = "/api/payment/credit/mine"
_TIMEOUT = 15

# Balance cache (module-level, process-local): the dashboard widget and
# the service-status check both read the credit, and the widget
# auto-refreshes every 5 minutes — without this, every check would be
# a live call to ippanel.
_BALANCE_TTL_SECONDS = 300
_balance_cache: dict = {"at": 0.0, "key": "", "result": None}


class IppanelError(Exception):
    """Any ippanel failure that is not an auth failure."""

    def __init__(self, message: str, code: str = "", status_code: int = 0):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class IppanelAuthError(IppanelError):
    """The API key was rejected (HTTP 401 / meta code "400-1")."""


def create_ippanel_client() -> httpx.Client:
    """Factory for the HTTP client (monkeypatch point for tests)."""
    return httpx.Client(trust_env=False, timeout=_TIMEOUT)


def _headers(api_key: str) -> dict:
    # Edge auth is the RAW token — no scheme prefix (docs/auth/index.md).
    return {"Authorization": api_key, "Content-Type": "application/json"}


def _check_envelope(payload: dict, action: str) -> dict:
    """Validate an Edge ``data``/``meta`` envelope; return ``data``.

    Raises IppanelAuthError on code "400-1", IppanelError otherwise.
    """
    meta = payload.get("meta") or {}
    if meta.get("status") is True:
        return payload.get("data") or {}
    code = str(meta.get("message_code") or "")
    message = str(meta.get("message") or "IPPanel request failed")
    errors = meta.get("errors") or {}
    detail = f"{action} failed: {message} (code {code})" if code else f"{action} failed: {message}"
    if errors:
        detail += f" — {errors}"
    if code == "400-1":
        raise IppanelAuthError(detail, code=code, status_code=401)
    raise IppanelError(detail, code=code)


def _post(client: httpx.Client, api_key: str, body: dict, action: str) -> dict:
    try:
        resp = client.post(
            f"{BASE_URL}{SEND_PATH}", headers=_headers(api_key), json=body, timeout=_TIMEOUT
        )
    except httpx.TimeoutException as exc:
        raise IppanelError(f"{action} timed out after {_TIMEOUT}s") from exc
    except httpx.HTTPError as exc:
        raise IppanelError(f"{action} request failed: {exc}") from exc
    if resp.status_code == 401:
        # 401 with no usable envelope: still an auth failure.
        try:
            _check_envelope(resp.json(), action)
        except IppanelError:
            raise
        raise IppanelAuthError(f"{action} failed: invalid or expired API key", status_code=401)
    if resp.status_code not in (200, 201):
        # A 4xx/5xx usually still carries the meta envelope (e.g. 422 +
        # code "400-2") — surface its code/message instead of a bare
        # HTTP status; fall back to the status only when the body is
        # not a parseable envelope.
        try:
            _check_envelope(resp.json(), action)
        except IppanelError:
            raise
        except ValueError:
            pass
        raise IppanelError(
            f"{action} failed: HTTP {resp.status_code}", status_code=resp.status_code
        )
    try:
        payload = resp.json()
    except ValueError as exc:
        raise IppanelError(f"{action} failed: non-JSON response from ippanel") from exc
    return _check_envelope(payload, action)


def send_webservice(
    api_key: str,
    sender: str,
    to: str,
    text: str,
    client: httpx.Client | None = None,
) -> list:
    """Send one plain SMS via the Edge webservice method.

    Returns the list of ``message_outbox_ids`` from the success
    envelope. Raises IppanelAuthError / IppanelError on failure.
    """
    own_client = client is None
    http = client if client is not None else create_ippanel_client()
    try:
        data = _post(
            http,
            api_key,
            {
                "sending_type": "webservice",
                "from_number": sender,
                "message": text,
                "params": {"recipients": [to]},
            },
            "ippanel send",
        )
        ids = data.get("message_outbox_ids")
        return list(ids) if isinstance(ids, list) else []
    finally:
        if own_client:
            http.close()


def send_pattern(
    api_key: str,
    sender: str,
    pattern_code: str,
    recipient: str,
    params: dict,
    client: httpx.Client | None = None,
) -> list:
    """Send one pattern SMS (Edge: ``sending_type: "pattern"``).

    Only ONE recipient is allowed per pattern call (docs/send/pattern.md).
    ``params`` keys must match the pattern's placeholders.
    Returns the list of ``message_outbox_ids``.
    """
    own_client = client is None
    http = client if client is not None else create_ippanel_client()
    try:
        data = _post(
            http,
            api_key,
            {
                "sending_type": "pattern",
                "from_number": sender,
                "code": pattern_code,
                "recipients": [recipient],
                "params": dict(params),
            },
            "ippanel pattern send",
        )
        ids = data.get("message_outbox_ids")
        return list(ids) if isinstance(ids, list) else []
    finally:
        if own_client:
            http.close()


def get_credit(api_key: str, client: httpx.Client | None = None) -> dict:
    """Fetch the account credit (Edge: ``GET /api/payment/credit/mine``).

    Returns the ``data`` object: ``credit`` (float), ``yesterday_credit``,
    ``gift``, ``gift_expires_at``, ``updated_at``. ``credit`` is coerced
    to float; a missing/non-numeric credit raises IppanelError.
    """
    own_client = client is None
    http = client if client is not None else create_ippanel_client()
    try:
        try:
            resp = http.get(
                f"{BASE_URL}{CREDIT_PATH}", headers=_headers(api_key), timeout=_TIMEOUT
            )
        except httpx.TimeoutException as exc:
            raise IppanelError(f"ippanel credit check timed out after {_TIMEOUT}s") from exc
        except httpx.HTTPError as exc:
            raise IppanelError(f"ippanel credit check failed: {exc}") from exc
        if resp.status_code == 401:
            try:
                _check_envelope(resp.json(), "ippanel credit check")
            except IppanelError:
                raise
            raise IppanelAuthError(
                "ippanel credit check failed: invalid or expired API key", status_code=401
            )
        if resp.status_code != 200:
            # As in _post: surface the meta envelope (e.g. 422 + code
            # "400-2") when the body carries one.
            try:
                _check_envelope(resp.json(), "ippanel credit check")
            except IppanelError:
                raise
            except ValueError:
                pass
            raise IppanelError(
                f"ippanel credit check failed: HTTP {resp.status_code}",
                status_code=resp.status_code,
            )
        try:
            payload = resp.json()
        except ValueError as exc:
            raise IppanelError("ippanel credit check failed: non-JSON response") from exc
        data = _check_envelope(payload, "ippanel credit check")
        try:
            credit = float(data["credit"])
        except (KeyError, TypeError, ValueError) as exc:
            raise IppanelError("ippanel credit check failed: no numeric credit in response") from exc
        return {**data, "credit": credit}
    finally:
        if own_client:
            http.close()


def get_credit_cached(api_key: str, force: bool = False, client: httpx.Client | None = None) -> dict:
    """Credit with a ~5-minute in-memory cache (per API key).

    Returns the same dict as :func:`get_credit` plus ``_cached: bool``.
    A cached failure is NOT stored — only successes are cached, so a
    transient failure never pins the widget to an error for 5 minutes.
    """
    global _balance_cache
    now = time.monotonic()
    if (
        not force
        and _balance_cache["result"] is not None
        and _balance_cache["key"] == api_key
        and now - _balance_cache["at"] < _BALANCE_TTL_SECONDS
    ):
        return {**_balance_cache["result"], "_cached": True}
    result = get_credit(api_key, client=client)
    _balance_cache = {"at": now, "key": api_key, "result": result}
    return {**result, "_cached": False}


def reset_credit_cache() -> None:
    """Clear the balance cache (tests only)."""
    global _balance_cache
    _balance_cache = {"at": 0.0, "key": "", "result": None}
