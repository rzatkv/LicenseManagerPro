"""Service status endpoint (v3.0): concurrent short-timeout checks."""
import pytest

from services import service_status as status_service


def test_service_status_admin_only(client, auth_headers):
    resp = client.get("/api/system/service-status")
    assert resp.status_code == 401
    resp = client.get("/api/system/service-status", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "services" in body and "checked_at" in body
    keys = {s["key"] for s in body["services"]}
    assert keys == {"database", "email", "sms", "telegram", "github"}
    for service in body["services"]:
        assert service["status"] in (
            "connected", "not_configured", "unreachable", "auth_failed",
        )
        assert "detail" in service
    # No secrets anywhere in the response: no credential values, no
    # secret/password/api-key markers. (The word "token" alone is not a
    # secret — the telegram row legitimately says "no bot token
    # configured" — so it is not asserted on.)
    import json

    dumped = json.dumps(body).lower()
    assert "password" not in dumped
    assert "secret" not in dumped
    assert "api_key" not in dumped
    assert "api-key" not in dumped


def test_service_status_database_connected(client, auth_headers):
    resp = client.get("/api/system/service-status", headers=auth_headers)
    db_service = next(s for s in resp.json()["services"] if s["key"] == "database")
    assert db_service["status"] == "connected"


def test_service_status_unconfigured_channels(client, auth_headers):
    resp = client.get("/api/system/service-status", headers=auth_headers)
    by_key = {s["key"]: s for s in resp.json()["services"]}
    assert by_key["email"]["status"] == "not_configured"
    assert by_key["sms"]["status"] == "not_configured"
    assert by_key["telegram"]["status"] == "not_configured"


def test_service_status_telegram_mocked(client, auth_headers, monkeypatch):
    """Telegram check with a mocked getMe: connected when ok."""
    class FakeResp:
        status_code = 200

        def json(self):
            return {"ok": True, "result": {"username": "TestBot"}}

    monkeypatch.setattr(
        "httpx.get", lambda url, **kwargs: FakeResp()
    )
    client.put(
        "/api/settings/telegram-config",
        json={"bot_token": "1:TOKEN", "chat_ids": ["111"]},
        headers=auth_headers,
    )
    resp = client.get("/api/system/service-status", headers=auth_headers)
    tg = next(s for s in resp.json()["services"] if s["key"] == "telegram")
    assert tg["status"] == "connected"
    assert "TestBot" in tg["detail"]
