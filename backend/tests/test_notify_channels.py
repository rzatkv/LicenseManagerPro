"""Per-event notification channels (v3.0): toggles really gate sends."""
import pytest

from services import notify_channels as channels


def _set_matrix(client, auth_headers, matrix):
    resp = client.put(
        "/api/settings/notification-channels", json=matrix, headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


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


def test_channels_default_email_on_others_off(client, auth_headers):
    matrix = client.get(
        "/api/settings/notification-channels", headers=auth_headers
    ).json()
    assert matrix["license_created"] == {"email": True, "sms": False, "telegram": False}
    assert set(matrix) == set(channels.EVENTS)


def test_channels_reject_unknown_event_or_channel(client, auth_headers):
    resp = client.put(
        "/api/settings/notification-channels",
        json={"nope": {"email": True}},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    resp = client.put(
        "/api/settings/notification-channels",
        json={"license_created": {"pigeon": True}},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_disabled_email_sends_nothing_enabled_sends(client, auth_headers, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "services.mail.send_mail",
        lambda db, to, subject, body: sent.append((to, subject, body)) or True,
    )
    from database import SessionLocal

    # Email OFF for license_created: creating a product+license sends nothing.
    _set_matrix(client, auth_headers, {"license_created": {"email": False}})
    resp = client.post(
        "/api/products",
        json={"name": "Widget", "billing_cycles": ["monthly"]},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    pid = resp.json()["id"]
    resp = client.post(
        "/api/licenses",
        json={"product_id": pid, "billing_cycle": "monthly"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert sent == []
    # But the in-app (bell) notification still fired.
    resp = client.get("/api/notifications", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert any("License created" in n["title"] for n in resp.json()["notifications"])

    # Email ON again: the next license sends one email, using the stored
    # license_created template (subject mentions the product).
    _set_matrix(client, auth_headers, {"license_created": {"email": True}})
    resp = client.post(
        "/api/licenses",
        json={"product_id": pid, "billing_cycle": "monthly"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert len(sent) == 1
    assert "Widget" in sent[0][1]
    assert sent[0][0] == "admin@example.com"


def test_sms_channel_gated(client, auth_headers, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "services.sms.send_sms",
        lambda db, to, text: sent.append((to, text)) or True,
    )
    # Give the admin a phone number so SMS has a recipient.
    uid = client.get("/api/users", headers=auth_headers).json()[0]["id"]
    client.put(f"/api/users/{uid}", json={"phone": "+989121234567"}, headers=auth_headers)
    # SMS ON for user_created: creating a user sends an SMS.
    _set_matrix(client, auth_headers, {"user_created": {"sms": True}})
    resp = client.post(
        "/api/users",
        json={"email": "new@example.com", "password": "newpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert len(sent) == 1
    assert sent[0][0] == "+989121234567"
    # SMS OFF: no SMS for the next user.
    _set_matrix(client, auth_headers, {"user_created": {"sms": False}})
    resp = client.post(
        "/api/users",
        json={"email": "new2@example.com", "password": "newpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert len(sent) == 1


def test_non_admin_cannot_change_matrix(client, auth_headers):
    mgr = _manager_headers(client, auth_headers)
    resp = client.put(
        "/api/settings/notification-channels",
        json={"license_created": {"email": False}},
        headers=mgr,
    )
    assert resp.status_code == 403
