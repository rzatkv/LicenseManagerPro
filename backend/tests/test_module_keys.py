"""Module-key auth on the license routes (v2.3).

WHMCS/WooCommerce connect with an X-API-Key header only — never with an
admin email/password. A key created with scopes=["module"] (time-limited,
90 days here) may call the module-facing license routes; a legacy key
without the module scope gets 403 there, and a module key can never call
an admin endpoint (GET /api/users) or work once expired (401).

Note: the parent may add more tests to this file; these four are the
route-level contract for the license router.
"""

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta

from database import SessionLocal
from models import ApiKey
from services.api_keys import hash_api_key


def _create_module_key(client, auth_headers, **overrides):
    """Create a module-scoped key via the API; return the secret (shown
    once in ``plain_key``)."""
    body = {"scopes": ["module"], "expires_in_days": 90}
    body.update(overrides)
    response = client.post("/api/api-keys", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["plain_key"], "create must return the secret once"
    return data["plain_key"]


def _create_legacy_key(client, auth_headers):
    """A legacy key (access rights, no scopes): valid, but not a module
    key, so module endpoints must reject it with 403."""
    response = client.post(
        "/api/api-keys",
        json={"access_rights": ["create_license"]},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["plain_key"]
    return response.json()["plain_key"]


def _create_product(client, auth_headers, cycles=None):
    response = client.post(
        "/api/products",
        json={"name": "ModuleProd", "billing_cycles": cycles or ["monthly"]},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _expire_key(plain_key):
    """Move a key's expiry into the past, directly in the DB: module keys
    can only be created with a future expiry (30/90/180/365 days)."""
    db = SessionLocal()
    try:
        entry = db.query(ApiKey).filter(ApiKey.key_hash == hash_api_key(plain_key)).first()
        assert entry is not None
        entry.expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1)
        db.commit()
    finally:
        db.close()


def test_module_key_can_create_license_with_billing_cycle_sync(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    plain_key = _create_module_key(client, auth_headers)

    response = client.post(
        "/api/licenses",
        json={"product_id": product["id"], "billing_cycle": "annual"},
        headers={"X-API-Key": plain_key},
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["billing_cycle"] == "annual"
    # The cycle the module sent was synced onto the product.
    response = client.get(f"/api/products/{product['id']}", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert response.json()["billing_cycles"] == ["monthly", "annual"]
    # The audit row records the module key, not a user email.
    response = client.get("/api/audit-logs?actor=module-key&entity=license", headers=auth_headers)
    assert response.status_code == 200, response.text
    rows = [r for r in response.json() if r["action"] == "license.create"]
    assert rows, "no license.create audit row for the module key"
    assert rows[0]["actor_email"].startswith("module-key:")


def test_key_without_module_scope_gets_403_on_create(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    plain_key = _create_legacy_key(client, auth_headers)

    response = client.post(
        "/api/licenses",
        json={"product_id": product["id"], "billing_cycle": "monthly"},
        headers={"X-API-Key": plain_key},
    )
    assert response.status_code == 403, response.text
    assert "lacks scope" in response.json()["detail"]


def test_module_key_cannot_call_admin_endpoint(client, auth_headers):
    plain_key = _create_module_key(client, auth_headers)

    # No JWT at all: the users router is JWT-only, so the module key is
    # not even authenticated there (401, not 403).
    response = client.get("/api/users", headers={"X-API-Key": plain_key})
    assert response.status_code == 401, response.text


def test_expired_module_key_gets_401(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    plain_key = _create_module_key(client, auth_headers)
    _expire_key(plain_key)

    response = client.post(
        "/api/licenses",
        json={"product_id": product["id"], "billing_cycle": "monthly"},
        headers={"X-API-Key": plain_key},
    )
    assert response.status_code == 401, response.text
    assert "expired" in response.json()["detail"].lower()


# --- Additional module-key tests (parent) ---------------------------------


def _sign(secret: str, method: str, path: str, timestamp: str, body: bytes) -> str:
    """The module signing algorithm: HMAC-SHA256(key=SHA256(secret),
    method + "\\n" + path + "\\n" + timestamp + "\\n" + SHA256(body))."""
    body_hash = hashlib.sha256(body or b"").hexdigest()
    message = f"{method}\n{path}\n{timestamp}\n{body_hash}".encode()
    return hmac.new(
        hashlib.sha256(secret.encode("utf-8")).digest(), message, hashlib.sha256
    ).hexdigest()


def test_module_key_can_read_renew_revoke(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly", "annual"])
    plain_key = _create_module_key(client, auth_headers)
    headers = {"X-API-Key": plain_key}

    response = client.post(
        "/api/licenses",
        json={"product_id": product["id"], "billing_cycle": "monthly"},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    license_id = response.json()["id"]

    assert client.get("/api/licenses", headers=headers).status_code == 200
    assert client.get(f"/api/licenses/{license_id}", headers=headers).status_code == 200
    assert client.get("/api/products", headers=headers).status_code == 200
    assert client.get("/api/system/info", headers=headers).status_code == 200
    assert (
        client.post(f"/api/licenses/{license_id}/renew", json={}, headers=headers).status_code
        == 200
    )
    assert client.delete(f"/api/licenses/{license_id}", headers=headers).status_code == 200


def test_module_key_expiry_rules(client, auth_headers):
    # Default is 90 days when expires_in_days is omitted.
    response = client.post("/api/api-keys", json={"scopes": ["module"]}, headers=auth_headers)
    assert response.status_code == 201, response.text
    expires = datetime.fromisoformat(response.json()["expires_at"].replace("Z", ""))
    now = datetime.now(UTC).replace(tzinfo=None)
    assert timedelta(days=88) < (expires - now) < timedelta(days=92)
    # 400 days is rejected (allowed set: 30/90/180/365).
    response = client.post(
        "/api/api-keys",
        json={"scopes": ["module"], "expires_in_days": 400},
        headers=auth_headers,
    )
    assert response.status_code == 400, response.text
    # 30 days is accepted.
    response = client.post(
        "/api/api-keys",
        json={"scopes": ["module"], "expires_in_days": 30},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text


def test_module_key_ip_allowlist(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    plain_key = _create_module_key(client, auth_headers, associated_ip="203.0.113.99")
    response = client.post(
        "/api/licenses",
        json={"product_id": product["id"], "billing_cycle": "monthly"},
        headers={"X-API-Key": plain_key},
    )
    # The test client is not 203.0.113.99, so the key must not work.
    assert response.status_code == 403, response.text


def test_signed_requests(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    plain_key = _create_module_key(client, auth_headers, require_signed_requests=True)
    path = "/api/licenses"
    body = json.dumps({"product_id": product["id"], "billing_cycle": "monthly"}).encode("utf-8")

    # Unsigned request is rejected when signing is required.
    response = client.post(path, content=body, headers={"X-API-Key": plain_key})
    assert response.status_code == 401, response.text

    # Correctly signed request works.
    ts = str(int(time.time()))
    sig = _sign(plain_key, "POST", path, ts, body)
    headers = {
        "X-API-Key": plain_key,
        "X-LMP-Timestamp": ts,
        "X-LMP-Signature": sig,
        "Content-Type": "application/json",
    }
    response = client.post(path, content=body, headers=headers)
    assert response.status_code == 201, response.text

    # Replaying the exact same signature is rejected.
    response = client.post(path, content=body, headers=headers)
    assert response.status_code == 401, response.text

    # Stale timestamp is rejected.
    stale_ts = str(int(time.time()) - 600)
    stale_sig = _sign(plain_key, "POST", path, stale_ts, body)
    response = client.post(
        path,
        content=body,
        headers={
            "X-API-Key": plain_key,
            "X-LMP-Timestamp": stale_ts,
            "X-LMP-Signature": stale_sig,
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 401, response.text

    # Wrong signature is rejected.
    response = client.post(
        path,
        content=body,
        headers={
            "X-API-Key": plain_key,
            "X-LMP-Timestamp": str(int(time.time())),
            "X-LMP-Signature": "0" * 64,
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 401, response.text


def test_rotation_invalidates_old_key(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    old_secret = _create_module_key(client, auth_headers)
    # Find the key id via the list endpoint (prefix lookup).
    keys = client.get("/api/api-keys", headers=auth_headers).json()["api_keys"]
    key_id = next(k for k in keys if k["key"] == old_secret[:12])["id"]
    response = client.post(f"/api/api-keys/{key_id}/rotate", headers=auth_headers)
    assert response.status_code == 200, response.text
    new_secret = response.json()["plain_key"]
    assert new_secret and new_secret != old_secret

    payload = {"product_id": product["id"], "billing_cycle": "monthly"}
    assert (
        client.post("/api/licenses", json=payload, headers={"X-API-Key": old_secret}).status_code
        == 401
    )
    assert (
        client.post("/api/licenses", json=payload, headers={"X-API-Key": new_secret}).status_code
        == 201
    )


def test_key_secret_never_listed(client, auth_headers):
    secret = _create_module_key(client, auth_headers)
    response = client.get("/api/api-keys", headers=auth_headers)
    assert response.status_code == 200
    assert secret not in response.text
    entry = next(k for k in response.json()["api_keys"] if k["key"] == secret[:12])
    assert entry.get("plain_key") is None


def test_module_calls_are_audit_logged(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    plain_key = _create_module_key(client, auth_headers)
    client.post(
        "/api/licenses",
        json={"product_id": product["id"], "billing_cycle": "monthly"},
        headers={"X-API-Key": plain_key},
    )
    response = client.get("/api/audit-logs?entity=api_key", headers=auth_headers)
    assert response.status_code == 200, response.text
    actions = [row["action"] for row in response.json()]
    assert "module.api_call" in actions
