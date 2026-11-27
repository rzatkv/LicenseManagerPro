"""Editable SMS/Telegram notification texts (v3.0.7)."""
import pytest

from services import notify_channels as texts

TITLE = "License created"
MESSAGE = "License LIC-1 for Widget was created."
CTX = {
    "license_key": "LIC-1",
    "product_name": "Widget",
    "expiry_date": "2027-01-31",
    "days_left": "7",
    "user_email": "buyer@example.com",
    "role": "viewer",
    "site_name": "License Manager Pro",
}


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


def test_defaults_reproduce_hardcoded_output():
    """v3.0.7: the default templates render byte-identical to the
    pre-v3.0.7 hardcoded SMS/Telegram text."""
    sms = texts.render_notification_text(
        texts.DEFAULT_TEXTS["license_created"]["sms"], TITLE, MESSAGE, CTX,
        fallback="FALLBACK",
    )
    assert sms == f"{TITLE}: {MESSAGE}"
    telegram = texts.render_notification_text(
        texts.DEFAULT_TEXTS["license_created"]["telegram"], TITLE, MESSAGE, CTX,
        fallback="FALLBACK",
    )
    assert telegram == f"{TITLE}\n{MESSAGE}"
    for event in texts.EVENTS:
        assert texts.DEFAULT_TEXTS[event] == {
            "sms": "{title}: {message}",
            "telegram": "{title}\n{message}",
        }


def test_custom_template_renders_title_message_and_context():
    rendered = texts.render_notification_text(
        "Hi {title} — key {license_key} ({product_name}) expires {expiry_date}, "
        "{days_left} days left, {user_email} / {role} @ {site_name}",
        TITLE, MESSAGE, CTX, fallback="FALLBACK",
    )
    assert rendered == (
        "Hi License created — key LIC-1 (Widget) expires 2027-01-31, "
        "7 days left, buyer@example.com / viewer @ License Manager Pro"
    )
    # A template with no placeholders at all is fine.
    assert texts.render_notification_text(
        "plain text", TITLE, MESSAGE, CTX, fallback="FALLBACK"
    ) == "plain text"


def test_unknown_placeholder_left_literal_and_logged(caplog):
    rendered = texts.render_notification_text(
        "{title} {nope} {message}", TITLE, MESSAGE, CTX, fallback="FALLBACK"
    )
    assert rendered == f"{TITLE} {{nope}} {MESSAGE}"
    assert "nope" in caplog.text


def test_render_never_crashes_on_bad_context():
    class Exploding:
        def __str__(self):
            raise RuntimeError("boom")

    rendered = texts.render_notification_text(
        "{title} {license_key}", TITLE, MESSAGE, {"license_key": Exploding()},
        fallback="FALLBACK",
    )
    assert rendered == "FALLBACK"


def test_get_texts_defaults_and_merge(client, auth_headers):
    matrix = client.get(
        "/api/settings/notification-texts", headers=auth_headers
    ).json()
    assert set(matrix) == set(texts.EVENTS)
    assert matrix["license_created"] == {
        "sms": "{title}: {message}",
        "telegram": "{title}\n{message}",
    }
    # Partial PUT merges over the defaults, returns the merged matrix.
    resp = client.put(
        "/api/settings/notification-texts",
        json={"license_created": {"sms": "NEW {title}"}},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    merged = resp.json()
    assert merged["license_created"]["sms"] == "NEW {title}"
    assert merged["license_created"]["telegram"] == "{title}\n{message}"
    assert merged["license_expired"]["sms"] == "{title}: {message}"


def test_put_rejects_unknown_event_channel_and_bad_values(client, auth_headers):
    for bad in (
        {"nope": {"sms": "x"}},
        {"license_created": {"email": "x"}},
        {"license_created": {"sms": 123}},
        {"license_created": "not-an-object"},
        {"license_created": {"sms": "x" * (texts.MAX_TEXT_LENGTH + 1)}},
    ):
        resp = client.put(
            "/api/settings/notification-texts", json=bad, headers=auth_headers
        )
        assert resp.status_code == 400, bad
    resp = client.put(
        "/api/settings/notification-texts", json=[], headers=auth_headers
    )
    assert resp.status_code in (400, 422)


def test_non_admin_cannot_change_texts(client, auth_headers):
    mgr = _manager_headers(client, auth_headers)
    resp = client.get("/api/settings/notification-texts", headers=mgr)
    assert resp.status_code == 200
    resp = client.put(
        "/api/settings/notification-texts",
        json={"license_created": {"sms": "x"}},
        headers=mgr,
    )
    assert resp.status_code == 403


def test_edited_sms_text_is_sent(client, auth_headers, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "services.sms.send_sms",
        lambda db, to, text: sent.append((to, text)) or True,
    )
    uid = client.get("/api/users", headers=auth_headers).json()[0]["id"]
    client.put(f"/api/users/{uid}", json={"phone": "+989121234567"}, headers=auth_headers)
    client.put(
        "/api/settings/notification-channels",
        json={"user_created": {"sms": True}},
        headers=auth_headers,
    )
    resp = client.put(
        "/api/settings/notification-texts",
        json={"user_created": {"sms": "Welcome {user_email} ({role}) — {title}"}},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    resp = client.post(
        "/api/users",
        json={"email": "new@example.com", "password": "newpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert len(sent) == 1
    assert sent[0][1] == "Welcome new@example.com (support) — New user created"


def test_edited_telegram_text_is_sent(client, auth_headers, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "services.telegram.send_telegram",
        lambda db, text: sent.append(text) or True,
    )
    client.put(
        "/api/settings/notification-channels",
        json={"user_created": {"telegram": True}},
        headers=auth_headers,
    )
    resp = client.put(
        "/api/settings/notification-texts",
        json={"user_created": {"telegram": "TG: {title}\n{user_email}"}},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    resp = client.post(
        "/api/users",
        json={"email": "new@example.com", "password": "newpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert len(sent) == 1
    assert sent[0] == "TG: New user created\nnew@example.com"
