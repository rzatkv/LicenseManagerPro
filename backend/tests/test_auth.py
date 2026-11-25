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
