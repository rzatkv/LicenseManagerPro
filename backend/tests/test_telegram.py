"""Telegram notifications (v3.0): config hidden, test-send, toggles."""
import json

from services import telegram as tg_service


def _set_telegram(client, auth_headers, payload):
    resp = client.put("/api/settings/telegram-config", json=payload, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_telegram_config_hides_token(client, auth_headers):
    cfg = _set_telegram(
        client, auth_headers, {"bot_token": "123456:SECRET-TOKEN", "chat_ids": ["111", "222"]}
    )
    assert cfg["token_configured"] is True
    assert cfg["chat_ids"] == ["111", "222"]
    assert "SECRET-TOKEN" not in json.dumps(cfg)
    resp = client.get("/api/settings", headers=auth_headers)
    assert "telegram_config" not in resp.json()


def test_telegram_test_send_mocked(client, auth_headers, monkeypatch):
    calls = []

    class FakeResp:
        status_code = 200

        def json(self):
            return {"ok": True}

    class FakeClient:
        def post(self, url, **kwargs):
            calls.append((url, kwargs))
            return FakeResp()

    monkeypatch.setattr(tg_service, "create_telegram_client", lambda: FakeClient())
    _set_telegram(
        client, auth_headers, {"bot_token": "123456:TOKEN", "chat_ids": ["111"]}
    )
    resp = client.post("/api/settings/telegram-config/test", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["sent"] is True
    assert len(calls) == 1
    assert "api.telegram.org/bot123456:TOKEN/sendMessage" in calls[0][0]
    assert calls[0][1]["json"]["chat_id"] == "111"
    # The test send is logged as a notify.telegram_sent entry.
    resp = client.get("/api/audit-logs?channel=telegram", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert any(r["action"] == "notify.telegram_sent" for r in resp.json())


def test_telegram_test_send_without_token_is_false(client, auth_headers):
    resp = client.post("/api/settings/telegram-config/test", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["sent"] is False


def test_telegram_channel_gated_by_matrix(client, auth_headers, monkeypatch):
    calls = []
    monkeypatch.setattr(
        tg_service,
        "send_telegram",
        lambda db, text: calls.append(text) or True,
    )
    _set_telegram(
        client, auth_headers, {"bot_token": "123456:TOKEN", "chat_ids": ["111"]}
    )
    # Telegram ON for user_created: creating a user sends one Telegram message.
    resp = client.put(
        "/api/settings/notification-channels",
        json={"user_created": {"telegram": True}},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    resp = client.post(
        "/api/users",
        json={"email": "tg@example.com", "password": "tgpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert len(calls) == 1
    assert "tg@example.com" in calls[0]
    # Telegram OFF: no message for the next user.
    client.put(
        "/api/settings/notification-channels",
        json={"user_created": {"telegram": False}},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/users",
        json={"email": "tg2@example.com", "password": "tgpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert len(calls) == 1


def test_telegram_config_validation(client, auth_headers):
    resp = client.put(
        "/api/settings/telegram-config",
        json={"chat_ids": "not-a-list"},
        headers=auth_headers,
    )
    assert resp.status_code == 200  # a comma-separated string is accepted
    resp = client.put(
        "/api/settings/telegram-config",
        json={"unknown_field": "x"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
