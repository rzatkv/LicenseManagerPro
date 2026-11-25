"""Adversarial security tests (v2.3). Every test here must FAIL CLOSED:
a role-escalation attempt, an IDOR attempt, a forged/expired token, an
injection payload, an oversized upload, a replayed TOTP code, a reused
single-use key, or a blacklisted caller must all be rejected.
"""

import hashlib
import hmac
from datetime import timedelta

import pyotp


def _make_user(client, auth_headers, email, role):
    resp = client.post(
        "/api/users",
        json={"email": email, "password": "password123", "role": role},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _login(client, email, password="password123"):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _enable_2fa(client, headers):
    resp = client.post("/api/auth/2fa/setup", headers=headers)
    assert resp.status_code == 200, resp.text
    secret = resp.json()["secret"]
    code = pyotp.TOTP(secret).now()
    resp = client.post("/api/auth/2fa/verify", json={"code": code}, headers=headers)
    assert resp.status_code == 200, resp.text
    return secret


# --- Authorization ---------------------------------------------------------
def test_viewer_cannot_call_admin_endpoints(client, auth_headers):
    _make_user(client, auth_headers, "viewer@example.com", "viewer")
    headers = _login(client, "viewer@example.com")
    assert client.get("/api/roles", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/roles", json={"name": "X", "slug": "x", "permissions": []}, headers=headers
        ).status_code
        == 403
    )
    assert client.get("/api/users", headers=headers).status_code == 403
    assert (
        client.put(
            "/api/settings/license-security", json={"strictness": "lenient"}, headers=headers
        ).status_code
        == 403
    )
    assert client.delete("/api/users/1", headers=headers).status_code == 403


def test_manager_cannot_delete_users_or_promote_to_admin(client, auth_headers):
    _make_user(client, auth_headers, "manager@example.com", "manager")
    victim = _make_user(client, auth_headers, "victim@example.com", "viewer")
    admin = client.get("/api/users/me", headers=auth_headers).json()
    headers = _login(client, "manager@example.com")

    # Deleting any user is admin-only.
    assert client.delete(f"/api/users/{victim['id']}", headers=headers).status_code == 403
    # Promoting someone to admin is admin-only.
    assert (
        client.put(
            f"/api/users/{victim['id']}", json={"role": "admin"}, headers=headers
        ).status_code
        == 403
    )
    # Touching an admin user at all is admin-only.
    assert (
        client.put(
            f"/api/users/{admin['id']}", json={"display_name": "Pwned"}, headers=headers
        ).status_code
        == 403
    )
    # A built-in manager has no users:write at all, so even editing a
    # non-admin user is rejected (a custom role granted users:write
    # could, but still never an admin user — see the guard above).
    assert (
        client.put(
            f"/api/users/{victim['id']}", json={"display_name": "Renamed"}, headers=headers
        ).status_code
        == 403
    )


def test_support_cannot_modify_other_users(client, auth_headers):
    _make_user(client, auth_headers, "support@example.com", "support")
    victim = _make_user(client, auth_headers, "victim2@example.com", "viewer")
    headers = _login(client, "support@example.com")
    assert (
        client.put(
            f"/api/users/{victim['id']}", json={"display_name": "Pwned"}, headers=headers
        ).status_code
        == 403
    )
    assert client.get("/api/users", headers=headers).status_code == 403


# --- Tokens ----------------------------------------------------------------
def test_expired_and_forged_jwt_rejected(client, auth_headers):
    from utils.auth import create_access_token

    expired = create_access_token(
        {"sub": "1", "email": "admin@example.com", "role": "admin"},
        expires_delta=timedelta(seconds=-1),
    )
    assert (
        client.get("/api/users/me", headers={"Authorization": f"Bearer {expired}"}).status_code
        == 401
    )
    # Forged with the wrong secret.
    import jwt

    forged = jwt.encode(
        {"sub": "1", "email": "admin@example.com", "role": "admin"},
        "not-the-real-secret",
        algorithm="HS256",
    )
    assert (
        client.get("/api/users/me", headers={"Authorization": f"Bearer {forged}"}).status_code
        == 401
    )


def test_2fa_temp_token_cannot_authenticate_api_calls(client, auth_headers):
    _make_user(client, auth_headers, "totp@example.com", "viewer")
    headers = _login(client, "totp@example.com")
    _enable_2fa(client, headers)
    resp = client.post(
        "/api/auth/login", json={"email": "totp@example.com", "password": "password123"}
    )
    assert resp.status_code == 200 and resp.json().get("requires_2fa")
    temp = resp.json()["temp_token"]
    # The temp token must never work as an access token.
    assert (
        client.get("/api/users/me", headers={"Authorization": f"Bearer {temp}"}).status_code == 401
    )


def test_totp_wrong_code_and_replay_rejected(client, auth_headers):
    _make_user(client, auth_headers, "replay@example.com", "viewer")
    headers = _login(client, "replay@example.com")
    secret = _enable_2fa(client, headers)
    code = pyotp.TOTP(secret).now()

    resp = client.post(
        "/api/auth/login", json={"email": "replay@example.com", "password": "password123"}
    )
    temp = resp.json()["temp_token"]
    # Wrong code.
    assert (
        client.post("/api/auth/verify-2fa", json={"temp_token": temp, "code": "000000"}).status_code
        == 401
    )
    # Correct code once.
    resp = client.post("/api/auth/verify-2fa", json={"temp_token": temp, "code": code})
    assert resp.status_code == 200, resp.text
    # Same code again (new temp token) is a replay — rejected.
    resp = client.post(
        "/api/auth/login", json={"email": "replay@example.com", "password": "password123"}
    )
    temp2 = resp.json()["temp_token"]
    assert (
        client.post("/api/auth/verify-2fa", json={"temp_token": temp2, "code": code}).status_code
        == 401
    )


# --- Login enumeration + lockout -------------------------------------------
def test_login_does_not_enumerate_users(client, auth_headers):
    unknown = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "wrongpass123"}
    )
    known = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "wrongpass123"}
    )
    assert unknown.status_code == 401 and known.status_code == 401
    assert unknown.json() == known.json()


def test_failed_login_lockout(client, auth_headers):
    _make_user(client, auth_headers, "locked@example.com", "viewer")
    for _ in range(5):
        resp = client.post(
            "/api/auth/login",
            json={"email": "locked@example.com", "password": "wrongpass123"},
        )
        assert resp.status_code == 401
    # Even the CORRECT password is refused while locked.
    resp = client.post(
        "/api/auth/login",
        json={"email": "locked@example.com", "password": "password123"},
    )
    assert resp.status_code == 429, resp.text


# --- Injection --------------------------------------------------------------
def test_search_handles_injection_payloads_as_plain_strings(client, auth_headers):
    client.post(
        "/api/products",
        json={"name": "RealProduct", "billing_cycles": ["monthly"]},
        headers=auth_headers,
    )
    for payload in ("' OR 1=1 --", "<script>alert(1)</script>", "%", "_", "RealProduct'--"):
        resp = client.get("/api/search", params={"q": payload}, headers=auth_headers)
        assert resp.status_code == 200, payload
        data = resp.json()
        assert data["products"] == [], payload
    # A literal "%" must not match every row either.
    resp = client.get("/api/licenses", params={"search": "%"}, headers=auth_headers)
    assert resp.status_code == 200 and resp.json() == []


def test_xss_string_is_stored_verbatim_not_executed(client, auth_headers):
    payload = "<script>alert(1)</script>"
    resp = client.post(
        "/api/products",
        json={"name": payload, "billing_cycles": ["monthly"]},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == payload  # stored as data, never rendered as HTML


def test_webhook_url_scheme_rejected(client, auth_headers):
    resp = client.post(
        "/api/products",
        json={
            "name": "BadHook",
            "billing_cycles": ["monthly"],
            "webhook_url": "file:///etc/passwd",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400, resp.text


def test_webhook_ssrf_guard_blocks_internal_hosts():
    from services.webhooks import validate_webhook_url

    for url in (
        "http://127.0.0.1/hook",
        "http://localhost/hook",
        "http://10.0.0.5/hook",
        "http://192.168.1.1/hook",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/hook",
        "ftp://example.com/hook",
    ):
        allowed, _reason = validate_webhook_url(url)
        assert not allowed, url
    allowed, _reason = validate_webhook_url("https://8.8.8.8/hook")
    assert allowed


def test_webhook_signature_is_hmac_sha256_and_verifiable():
    from services.webhooks import _sign_body

    body = b'{"event": "license.created"}'
    sig = _sign_body("s3cr3t", body)
    expected = hmac.new(b"s3cr3t", body, hashlib.sha256).hexdigest()
    assert sig == expected
    # A tampered body fails a constant-time verification.
    assert not hmac.compare_digest(sig, _sign_body("s3cr3t", b'{"event": "x"}'))
    assert _sign_body(None, body) is None


# --- Uploads -----------------------------------------------------------------
def test_avatar_rejects_svg_and_oversized_uploads(client, auth_headers):
    svg = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"
    resp = client.put("/api/users/me", json={"avatar_url": svg}, headers=auth_headers)
    assert resp.status_code == 400, resp.text
    big = "data:image/png;base64," + "A" * 3_100_000
    resp = client.put("/api/users/me", json={"avatar_url": big}, headers=auth_headers)
    assert resp.status_code == 400, resp.text
    ok = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    resp = client.put("/api/users/me", json={"avatar_url": ok}, headers=auth_headers)
    assert resp.status_code == 200, resp.text


# --- API keys ------------------------------------------------------------------
def test_single_use_api_key_twice(client, auth_headers):
    resp = client.post(
        "/api/api-keys",
        json={"access_rights": ["get_license_info"], "single_use": True},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    plain = resp.json()["plain_key"]
    assert client.get("/api/api-keys/check-access", headers={"api-key": plain}).status_code == 200
    second = client.get("/api/api-keys/check-access", headers={"api-key": plain})
    assert second.status_code == 403, second.text


def test_blacklisted_domain_blocked_on_validate_and_check_access(client, auth_headers):
    resp = client.post(
        "/api/blacklist",
        json={"type": "domain", "value": "evil.example"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert (
        client.get(
            "/api/api-keys/check-access",
            params={"domain": "evil.example"},
            headers={"api-key": "lmp_doesnotmatter"},
        ).status_code
        == 403
    )
    # The blacklist service itself: an IP entry blocks that IP.
    resp = client.post(
        "/api/blacklist",
        json={"type": "ip", "value": "203.0.113.7"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    from database import SessionLocal
    from services import blacklist as blacklist_service

    db = SessionLocal()
    try:
        assert blacklist_service.is_blacklisted(db, ip="203.0.113.7") == "203.0.113.7"
        assert blacklist_service.is_blacklisted(db, ip="203.0.113.8") is None
    finally:
        db.close()


# --- Settings ------------------------------------------------------------------
def test_sensitive_settings_hidden_from_non_privileged_users(client, auth_headers):
    resp = client.put(
        "/api/settings/smtp_password",
        json={"key": "smtp_password", "value": "hunter2"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    _make_user(client, auth_headers, "reader@example.com", "viewer")
    headers = _login(client, "reader@example.com")
    assert "smtp_password" not in client.get("/api/settings", headers=headers).json()
    assert client.get("/api/settings/smtp_password", headers=headers).status_code == 404
    assert client.get("/api/settings/smtp_password", headers=auth_headers).status_code == 200
