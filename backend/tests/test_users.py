"""User management tests: admin CRUD, self-delete and last-admin guards."""
import pytest
from fastapi import HTTPException


def _create_user(client, auth_headers, email, role="viewer"):
    response = client.post(
        "/api/users",
        json={"email": email, "password": "userpass123", "role": role},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _login(client, email, password="userpass123"):
    response = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_list_users_requires_admin(client, auth_headers):
    response = client.get("/api/users", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1  # only the bootstrap admin

    _create_user(client, auth_headers, "plain@example.com", role="viewer")
    headers = _login(client, "plain@example.com")
    response = client.get("/api/users", headers=headers)
    assert response.status_code == 403


def test_create_user_duplicate_email_rejected(client, auth_headers):
    _create_user(client, auth_headers, "dup@example.com")
    response = client.post(
        "/api/users",
        json={"email": "dup@example.com", "password": "userpass123", "role": "viewer"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_update_user_role_and_active(client, auth_headers):
    user = _create_user(client, auth_headers, "upd@example.com")
    response = client.put(
        f"/api/users/{user['id']}",
        json={"role": "admin", "is_active": False},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    assert response.json()["is_active"] is False


def test_cannot_delete_own_account(client, auth_headers):
    me = client.get("/api/users/me", headers=auth_headers).json()
    response = client.delete(f"/api/users/{me['id']}", headers=auth_headers)
    assert response.status_code == 400


def test_delete_other_admin_allowed_while_one_remains(client, auth_headers):
    second = _create_user(client, auth_headers, "admin2@example.com", role="admin")
    response = client.delete(f"/api/users/{second['id']}", headers=auth_headers)
    assert response.status_code == 200


def test_cannot_delete_last_admin(client, auth_headers):
    """Service-level check: deleting the sole active admin is refused.

    (Via the API this is unreachable, because the only admin who could
    delete the last admin is that admin themself, which the self-delete
    guard catches first — so the guard is exercised directly here.)
    """
    from database import SessionLocal
    from models import User
    from services.users import delete_user

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@example.com").first()
        assert admin is not None
        # A different (not persisted) admin attempts the deletion.
        other_admin = User(id=999999, email="ghost@example.com", role="admin")
        with pytest.raises(HTTPException) as exc:
            delete_user(admin.id, db, other_admin)
        assert exc.value.status_code == 400
        assert "last admin" in exc.value.detail
    finally:
        db.close()


def test_delete_regular_user(client, auth_headers):
    user = _create_user(client, auth_headers, "gone@example.com")
    response = client.delete(f"/api/users/{user['id']}", headers=auth_headers)
    assert response.status_code == 200
    remaining = client.get("/api/users", headers=auth_headers).json()
    assert all(u["id"] != user["id"] for u in remaining)
