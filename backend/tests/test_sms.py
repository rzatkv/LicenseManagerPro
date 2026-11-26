"""SMS settings (v3.0): single active provider, credentials hidden."""
import json

from services import sms as sms_service


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


def test_sms_config_hides_credentials(client, auth_headers):
    resp = client.put(
        "/api/settings/sms-config",
        json={
            "active_provider": "kavenegar",
            "providers": {"kavenegar": {"api_key": "SECRETKEY123", "sender": "1000"}},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["active_provider"] == "kavenegar"
    assert body["providers"]["kavenegar"]["configured"] is True
    assert "SECRETKEY123" not in json.dumps(body)

    # The generic settings list never exposes sms_config at all.
    resp = client.get("/api/settings", headers=auth_headers)
    assert "sms_config" not in resp.json()
    resp = client.get("/api/settings/sms_config", headers=auth_headers)
    assert resp.status_code == 404


def test_only_one_provider_active(client, auth_headers):
    # Enable ippanel...
    resp = client.put(
        "/api/settings/sms-config",
        json={
            "active_provider": "ippanel",
            "providers": {"ippanel": {"api_key": "K1", "sender": "2000"}},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["active_provider"] == "ippanel"
    # ...then enable Kavenegar: ippanel is deactivated by construction.
    resp = client.put(
        "/api/settings/sms-config",
        json={
            "active_provider": "kavenegar",
            "providers": {"kavenegar": {"api_key": "K2", "sender": "1000"}},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["active_provider"] == "kavenegar"
    # Read back: exactly one active provider, never two.
    resp = client.get("/api/settings/sms-config", headers=auth_headers)
    assert resp.json()["active_provider"] == "kavenegar"


def test_sms_config_rejects_unknown_provider(client, auth_headers):
    resp = client.put(
        "/api/settings/sms-config",
        json={"active_provider": "twilio"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_sms_send_mocked(client, auth_headers, monkeypatch):
    """send_sms via the active provider, HTTP mocked (no live call)."""
    calls = []

    class FakeResp:
        status_code = 200

    class FakeClient:
        def post(self, url, **kwargs):
            calls.append((url, kwargs))
            return FakeResp()

    monkeypatch.setattr(sms_service, "create_sms_client", lambda: FakeClient())
    client.put(
        "/api/settings/sms-config",
        json={
            "active_provider": "kavenegar",
            "providers": {"kavenegar": {"api_key": "K2", "sender": "1000"}},
        },
        headers=auth_headers,
    )
    from database import SessionLocal

    db = SessionLocal()
    try:
        assert sms_service.send_sms(db, "+989121234567", "hello") is True
    finally:
        db.close()
    assert len(calls) == 1
    assert "api.kavenegar.com" in calls[0][0]
    assert "K2" in calls[0][0]


def test_sms_send_no_provider_is_false(client, auth_headers):
    from database import SessionLocal

    db = SessionLocal()
    try:
        assert sms_service.send_sms(db, "+989121234567", "hello") is False
    finally:
        db.close()
