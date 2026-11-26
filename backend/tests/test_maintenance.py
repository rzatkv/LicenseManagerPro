"""Maintenance mode (v3.0): server-side guard with admin bypass."""
import pytest


def _manager_headers(client, auth_headers):
    client.post(
        "/api/users",
        json={"email": "manager@example.com", "password": "managerpass123", "role": "manager"},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/auth/login",
        json={"email": "manager@example.com", "password": "managerpass123"},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _set_maintenance(client, auth_headers, mode, message=""):
    resp = client.put(
        "/api/settings/maintenance_mode",
        json={"key": "maintenance_mode", "value": mode},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    resp = client.put(
        "/api/settings/maintenance_message",
        json={"key": "maintenance_message", "value": message},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text


def test_maintenance_status_public(client):
    resp = client.get("/api/system/maintenance")
    assert resp.status_code == 200
    assert resp.json() == {"enabled": False, "message": ""}


def test_maintenance_blocks_visitors_admin_bypass(client, auth_headers):
    _set_maintenance(client, auth_headers, "on", "Down for upgrades — back soon.")

    # Public status reports it.
    resp = client.get("/api/system/maintenance")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True
    assert resp.json()["message"] == "Down for upgrades — back soon."

    # A visitor (no token) is blocked with the custom message.
    resp = client.get("/api/licenses")
    assert resp.status_code == 503
    assert resp.json()["message"] == "Down for upgrades — back soon."

    # A non-admin user is blocked too.
    mgr = _manager_headers(client, auth_headers)
    resp = client.get("/api/licenses", headers=mgr)
    assert resp.status_code == 503

    # Admin login still works during maintenance...
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert resp.status_code == 200, resp.text
    # ...and the admin bypass lets the admin use the panel.
    resp = client.get("/api/licenses", headers=auth_headers)
    assert resp.status_code == 200

    # Turning it off restores normal access.
    _set_maintenance(client, auth_headers, "off")
    resp = client.get("/api/licenses")
    assert resp.status_code in (200, 401)  # no longer 503
    assert resp.status_code != 503


def test_maintenance_mode_validation(client, auth_headers):
    resp = client.put(
        "/api/settings/maintenance_mode",
        json={"key": "maintenance_mode", "value": "maybe"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
