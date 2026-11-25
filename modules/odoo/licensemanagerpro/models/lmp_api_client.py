# -*- coding: utf-8 -*-
"""LicenseManagerPro API client (plain service class, not an Odoo model).

Authentication is by API key ONLY. There is no admin email/password
login anywhere in this module. TLS verification is always on
(``verify=True`` on every call) and there is no option to turn it off.

Optional HMAC-signed requests (``sign_requests=True``) send, on every
call:

* ``X-API-Key``: the module-scoped API key.
* ``X-LMP-Timestamp``: current Unix time in seconds.
* ``X-LMP-Signature``: hex(HMAC-SHA256(key, message)) where
  ``key`` is the raw bytes of SHA256(secret) and ``message`` is
  ``METHOD + "\\n" + PATH + "\\n" + TIMESTAMP + "\\n" +
  SHA256(raw request body bytes).hexdigest()``. PATH is the URL path
  only, without any query string. The server rejects timestamps older
  than five minutes.

Fail-closed behaviour: HTTP 401/403 raises :class:`LmpAuthError`
(the key is missing, revoked, expired, out of scope, or the signature
is invalid) and every other non-2xx status raises
:class:`LmpApiError`. No license is ever minted, renewed or changed
when the API call fails; callers must surface the error instead of
pretending the operation succeeded.
"""

import hashlib
import hmac
import json
import time
from typing import Any, Dict, List, Optional

import requests

# --- Constants (no magic strings elsewhere in the module) ---------------

#: Base path of the LicenseManagerPro REST API, appended to the panel URL.
API_PATH_PREFIX = "/api"

#: Header carrying the module-scoped API key.
HEADER_API_KEY = "X-API-Key"
#: Header carrying the Unix timestamp of a signed request.
HEADER_TIMESTAMP = "X-LMP-Timestamp"
#: Header carrying the HMAC-SHA256 signature of a signed request.
HEADER_SIGNATURE = "X-LMP-Signature"

#: Server-side replay window for signed requests (seconds).
SIGNATURE_WINDOW_SECONDS = 300
#: HTTP timeout for every API call (seconds).
DEFAULT_TIMEOUT_SECONDS = 15
#: HTTP status codes that mean "this key may not do that" (fail closed).
AUTH_STATUS_CODES = (401, 403)

#: The six billing cycles LicenseManagerPro understands.
LMP_BILLING_CYCLES = (
    "monthly",
    "quarterly",
    "semiannual",
    "annual",
    "biennial",
    "lifetime",
)

#: Odoo has no native billing cycle on a sale order line, so the
#: product mapping carries the cycle explicitly. These are the labels
#: shown in the mapping form.
LMP_BILLING_CYCLE_LABELS = {
    "monthly": "Monthly",
    "quarterly": "Quarterly",
    "semiannual": "Semi-Annual",
    "annual": "Annual",
    "biennial": "Biennial",
    "lifetime": "Lifetime (One Time)",
}

#: Status values a license can have on the backend.
LMP_LICENSE_STATUSES = ("active", "inactive", "revoked", "expired")

#: HTTP methods used by this client.
HTTP_GET = "GET"
HTTP_POST = "POST"
HTTP_PUT = "PUT"
HTTP_DELETE = "DELETE"


class LmpApiError(Exception):
    """Any non-auth failure talking to LicenseManagerPro."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class LmpAuthError(LmpApiError):
    """HTTP 401/403: the API key is invalid, expired, revoked, out of
    scope, or the request signature failed. Fail closed: the caller
    must not mint, renew or change any license and must show/log a
    clear error instead."""


def map_billing_cycle(value: Optional[str]) -> Optional[str]:
    """Return ``value`` when it is a known LicenseManagerPro cycle,
    otherwise ``None`` (the caller then omits the cycle from the
    request instead of sending a value the backend would reject)."""
    if value is None:
        return None
    candidate = str(value).strip().lower()
    return candidate if candidate in LMP_BILLING_CYCLES else None


class LmpApiClient:
    """Thin wrapper around the LicenseManagerPro REST API."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        sign_requests: bool = False,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        if not base_url or not base_url.strip():
            raise LmpApiError("LicenseManagerPro URL is not configured.")
        if not api_key or not api_key.strip():
            raise LmpApiError("LicenseManagerPro API key is not configured.")
        # ``base_url`` is the panel root, e.g. https://licenses.example.com
        self.base_url = base_url.strip().rstrip("/")
        self.api_key = api_key.strip()
        self.sign_requests = bool(sign_requests)
        self.timeout = timeout

    # -- public API -------------------------------------------------------

    def test_connection(self) -> Dict[str, Any]:
        """GET /system/info. Raises on any failure, so a success here
        proves the URL, the key and the network path all work."""
        return self._request(HTTP_GET, "/system/info")

    def get_product_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """Resolve a product slug to its backend product dict, or
        ``None`` when no product with that slug exists."""
        products = self._request(
            HTTP_GET, "/products", params={"slug": slug}
        )
        if isinstance(products, list):
            for product in products:
                if isinstance(product, dict) and product.get("slug") == slug:
                    return product
            return products[0] if len(products) == 1 else None
        return None

    def create_license(
        self,
        product_id: int,
        owner_email: str,
        billing_cycle: Optional[str] = None,
        license_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """POST /licenses. ``billing_cycle`` must already be a known
        LMP cycle (see :func:`map_billing_cycle`); when it is ``None``
        the field is omitted. Returns the created license dict."""
        payload: Dict[str, Any] = {
            "product_id": int(product_id),
            "owner_email": owner_email,
        }
        if billing_cycle:
            payload["billing_cycle"] = billing_cycle
        if license_key:
            payload["key"] = license_key
        return self._request(HTTP_POST, "/licenses", payload=payload)

    def list_licenses(self, search: Optional[str] = None) -> List[Dict[str, Any]]:
        """GET /licenses, optionally filtered by ``search`` (e-mail,
        key or product). Returns a list of license dicts."""
        params = {"search": search} if search else None
        result = self._request(HTTP_GET, "/licenses", params=params)
        return result if isinstance(result, list) else []

    def get_license(self, license_id: int) -> Dict[str, Any]:
        """GET /licenses/{id}. Returns the license dict."""
        return self._request(HTTP_GET, "/licenses/%d" % int(license_id))

    def update_license(
        self, license_id: int, values: Dict[str, Any]
    ) -> Dict[str, Any]:
        """PUT /licenses/{id} (e.g. ``{"status": "inactive"}``)."""
        return self._request(
            HTTP_PUT, "/licenses/%d" % int(license_id), payload=values
        )

    def revoke_license(self, license_id: int) -> None:
        """DELETE /licenses/{id} (revoke). Returns nothing on success."""
        self._request(HTTP_DELETE, "/licenses/%d" % int(license_id))

    def renew_license(
        self, license_id: int, billing_cycle: Optional[str] = None
    ) -> Dict[str, Any]:
        """POST /licenses/{id}/renew. The cycle is sent as the
        ``billing_cycle`` query parameter; the backend validates it,
        syncs it onto the linked product when missing, and extends the
        expiry by that cycle."""
        params = {"billing_cycle": billing_cycle} if billing_cycle else None
        return self._request(
            HTTP_POST,
            "/licenses/%d/renew" % int(license_id),
            params=params,
        )

    def validate_license(
        self,
        license_key: str,
        domain: Optional[str] = None,
        ip: Optional[str] = None,
        install_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """POST /licenses/validate. Returns the backend validation
        result (``valid`` plus detail/license when applicable)."""
        payload: Dict[str, Any] = {"key": license_key}
        if domain:
            payload["domain"] = domain
        if ip:
            payload["ip"] = ip
        if install_path:
            payload["install_path"] = install_path
        return self._request(HTTP_POST, "/licenses/validate", payload=payload)

    # -- internals --------------------------------------------------------

    def _signed_headers(
        self, method: str, path: str, body: bytes
    ) -> Dict[str, str]:
        """Build the authentication headers for one request. When
        signing is off this is just the API key header; when it is on,
        the timestamp + HMAC signature headers are added."""
        headers = {HEADER_API_KEY: self.api_key}
        if not self.sign_requests:
            return headers
        timestamp = str(int(time.time()))
        body_hash = hashlib.sha256(body or b"").hexdigest()
        message = "%s\n%s\n%s\n%s" % (method, path, timestamp, body_hash)
        signing_key = hashlib.sha256(self.api_key.encode("utf-8")).digest()
        signature = hmac.new(
            signing_key, message.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        headers[HEADER_TIMESTAMP] = timestamp
        headers[HEADER_SIGNATURE] = signature
        return headers

    def _request(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """One HTTP call. Returns the decoded JSON body on HTTP 2xx.
        Raises :class:`LmpAuthError` on 401/403 and
        :class:`LmpApiError` on any other failure. TLS verification is
        always enabled; it can never be disabled from this module."""
        api_path = API_PATH_PREFIX + path
        url = self.base_url + api_path
        body = b""
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
        headers = self._signed_headers(method, api_path, body)
        headers["Content-Type"] = "application/json"
        headers["Accept"] = "application/json"
        try:
            response = requests.request(
                method,
                url,
                data=body if payload is not None else None,
                params=params,
                headers=headers,
                timeout=self.timeout,
                verify=True,  # TLS verification is never disabled.
            )
        except requests.RequestException as exc:
            raise LmpApiError(
                "Could not reach LicenseManagerPro at %s: %s"
                % (self.base_url, exc)
            ) from exc
        if response.status_code in AUTH_STATUS_CODES:
            raise LmpAuthError(
                "LicenseManagerPro rejected the request (HTTP %d). "
                "The API key is invalid, expired, revoked, out of "
                "scope, or the request signature failed. No license "
                "was minted or changed."
                % response.status_code,
                status_code=response.status_code,
            )
        if not 200 <= response.status_code < 300:
            raise LmpApiError(
                "LicenseManagerPro returned HTTP %d: %s"
                % (response.status_code, self._error_detail(response)),
                status_code=response.status_code,
            )
        if response.status_code == 204 or not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise LmpApiError(
                "LicenseManagerPro returned a response that is not "
                "valid JSON."
            ) from exc

    @staticmethod
    def _error_detail(response: "requests.Response") -> str:
        """Best-effort readable detail from an error response body."""
        try:
            data = response.json()
        except ValueError:
            return response.text[:500] if response.text else "no detail"
        if isinstance(data, dict):
            detail = data.get("detail")
            if isinstance(detail, str):
                return detail
            if detail is not None:
                return json.dumps(detail)[:500]
        return response.text[:500] if response.text else "no detail"


def build_client_from_params(
    base_url: Optional[str],
    api_key: Optional[str],
    sign_requests: bool = False,
) -> LmpApiClient:
    """Build a client from stored settings values. Raises
    :class:`LmpApiError` when the URL or the key is missing, so the
    caller fails closed with a clear message instead of calling the
    backend anonymously."""
    if not base_url or not str(base_url).strip():
        raise LmpApiError(
            "LicenseManagerPro URL is not configured. Open Settings "
            "-> LicenseManagerPro and enter the panel URL."
        )
    if not api_key or not str(api_key).strip():
        raise LmpApiError(
            "LicenseManagerPro API key is not configured. Create a "
            "module-scoped key in the LicenseManagerPro panel and "
            "paste it in Settings -> LicenseManagerPro."
        )
    return LmpApiClient(str(base_url), str(api_key), sign_requests=sign_requests)
