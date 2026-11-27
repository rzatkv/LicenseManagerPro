"""Auth tests: bootstrap registration, login, JWT protection."""


def test_register_bootstrap_creates_first_admin(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "first@example.com", "password": "secretpass1"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "first@example.com"
    assert data["role"] == "admin"
    assert "hashed_password" not in data


def test_register_after_bootstrap_requires_admin(client, auth_headers):
    # A second user cannot register without an admin token.
    response = client.post(
        "/api/auth/register",
        json={"email": "second@example.com", "password": "secretpass1"},
    )
    assert response.status_code == 401
    # With the admin token it works.
    response = client.post(
        "/api/auth/register",
        json={"email": "second@example.com", "password": "secretpass1", "role": "viewer"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["role"] == "viewer"


def test_login_returns_bearer_token(client, admin_token):
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]


def test_login_wrong_password_rejected(client, admin_token):
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_login_unknown_email_rejected(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "whatever123"},
    )
    assert response.status_code == 401


def test_protected_route_requires_token(client):
    response = client.get("/api/users")
    assert response.status_code == 401


def test_invalid_token_rejected(client):
    response = client.get("/api/users", headers={"Authorization": "Bearer not-a-token"})
    assert response.status_code == 401


def test_me_returns_current_user(client, auth_headers):
    response = client.get("/api/users/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["email"] == "admin@example.com"


def test_boot_refuses_default_secret_key(monkeypatch):
    """v3.0.6 (security, H3): the app must not boot with the publicly
    known default JWT secret — before the fix it only logged a warning
    and served, so anyone knowing the default could forge admin JWTs."""
    import main as main_module
    import pytest

    monkeypatch.setattr(main_module, "SECRET_KEY", main_module.DEFAULT_SECRET_KEY)
    monkeypatch.delenv("LMP_ALLOW_DEFAULT_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="SECRET_KEY is still the shipped default"):
        main_module._require_real_secret_key()
    # A real secret boots fine, and the explicit local-dev opt-in does too.
    monkeypatch.setattr(main_module, "SECRET_KEY", "a-long-random-test-secret")
    main_module._require_real_secret_key()
    monkeypatch.setattr(main_module, "SECRET_KEY", main_module.DEFAULT_SECRET_KEY)
    monkeypatch.setenv("LMP_ALLOW_DEFAULT_SECRET", "1")
    main_module._require_real_secret_key()


def test_security_headers_include_hsts(client):
    """v3.0.6 (security, L1): every API response must carry HSTS.
    Before the fix the header was absent everywhere."""
    resp = client.get("/api/system/ready")
    assert resp.headers.get("strict-transport-security") == (
        "max-age=31536000; includeSubDomains"
    )
    assert resp.headers.get("x-frame-options") == "DENY"
    assert resp.headers.get("x-content-type-options") == "nosniff"


def test_register_rejects_password_over_72_bytes(client):
    """v3.0.6 (security, L7): bcrypt silently truncates passwords past
    72 bytes, so two long passwords sharing the first 72 bytes would
    be equivalent. Registration must refuse them (422), not silently
    weaken them. A 72-byte password still works."""
    long_pw = "x" * 73
    resp = client.post(
        "/api/auth/register",
        json={"email": "long@example.com", "password": long_pw},
    )
    assert resp.status_code == 422, resp.text
    ok = client.post(
        "/api/auth/register",
        json={"email": "ok@example.com", "password": "x" * 72},
    )
    assert ok.status_code == 201, ok.text
