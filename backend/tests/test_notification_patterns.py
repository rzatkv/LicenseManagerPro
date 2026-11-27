"""IPPanel pattern sending (v3.0.7, added scope).

`send_pattern()` exists in services/sms_ippanel.py but nothing called
it. When ippanel is the active provider AND a pattern code is set for
the event, that event's SMS goes out via send_pattern (one call per
admin phone) with params from the same template variables the editable
texts receive; otherwise the editable SMS text goes out via
send_webservice. The ippanel client is mocked — no live calls.
"""
import json

import pytest

from services import notify_channels as nc
from services import sms_ippanel as ippanel

SENDER = "+9810001234"
API_KEY = "test-ippanel-key"
PHONE = "+989121234567"


def _set_ippanel(client, auth_headers, active=True):
    resp = client.put(
        "/api/settings/sms-config",
        json={
            "active_provider": "ippanel" if active else "",
            "providers": {"ippanel": {"api_key": API_KEY, "sender": SENDER}},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text


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


def _admin_phone(client, auth_headers):
    uid = client.get("/api/users", headers=auth_headers).json()[0]["id"]
    client.put(f"/api/users/{uid}", json={"phone": PHONE}, headers=auth_headers)


# --- get/set helpers (pure) ------------------------------------------------


def test_build_pattern_params_stringifies_and_omits_missing():
    params = nc.build_pattern_params(
        "License created",
        "License LIC-1 for Widget was created.",
        {"license_key": "LIC-1", "product_name": "Widget", "days_left": 7,
         "user_email": "", "role": None, "expiry_date": "2027-01-31"},
    )
    assert params == {
        "title": "License created",
        "message": "License LIC-1 for Widget was created.",
        "license_key": "LIC-1",
        "product_name": "Widget",
        "expiry_date": "2027-01-31",
        "days_left": "7",  # int is stringified
    }
    # Empty string and None values are omitted, never sent as "".
    assert "user_email" not in params
    assert "role" not in params


def test_sample_pattern_params_match_the_ui_preview():
    params = nc.sample_pattern_params("license_expiring")
    assert params["license_key"] == "LIC-DEMO-1234-5678"
    assert params["product_name"] == "CloudPanel Pro"
    assert params["days_left"] == "7"
    assert params["title"] == "License created"
    assert "message" in params


# --- endpoints ------------------------------------------------------------


def test_patterns_get_put_round_trip_and_validation(client, auth_headers):
    resp = client.get("/api/settings/notification-patterns", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {event: "" for event in nc.EVENTS}

    resp = client.put(
        "/api/settings/notification-patterns",
        json={"license_created": "abc123", "user_created": "  welcome9  "},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["license_created"] == "abc123"
    assert body["user_created"] == "welcome9"  # surrounding space stripped
    assert body["license_expired"] == ""

    # Empty clears a code.
    resp = client.put(
        "/api/settings/notification-patterns",
        json={"license_created": ""},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["license_created"] == ""

    for bad in (
        {"no_such_event": "x"},
        {"license_created": 42},
        {"license_created": "x" * 201},
        {"license_created": ["abc"]},
    ):
        resp = client.put(
            "/api/settings/notification-patterns", json=bad, headers=auth_headers
        )
        assert resp.status_code == 400, bad
    resp = client.put("/api/settings/notification-patterns", json=[], headers=auth_headers)
    assert resp.status_code in (400, 422)


def test_non_admin_cannot_change_patterns(client, auth_headers):
    mgr = _manager_headers(client, auth_headers)
    resp = client.get("/api/settings/notification-patterns", headers=mgr)
    assert resp.status_code == 200
    resp = client.put(
        "/api/settings/notification-patterns",
        json={"license_created": "abc123"},
        headers=mgr,
    )
    assert resp.status_code == 403


# --- send path ------------------------------------------------------------


def test_pattern_code_set_sends_via_send_pattern(client, auth_headers, monkeypatch):
    calls = []
    monkeypatch.setattr(
        ippanel,
        "send_pattern",
        lambda api_key, sender, code, to, params: calls.append(
            (api_key, sender, code, to, params)
        )
        or [1],
    )
    monkeypatch.setattr(
        ippanel, "send_webservice", lambda *a, **k: (_ for _ in ()).throw(AssertionError("webservice must not be called"))
    )
    _set_ippanel(client, auth_headers)
    _admin_phone(client, auth_headers)
    client.put(
        "/api/settings/notification-channels",
        json={"user_created": {"sms": True}},
        headers=auth_headers,
    )
    resp = client.put(
        "/api/settings/notification-patterns",
        json={"user_created": "welcome9"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    resp = client.post(
        "/api/users",
        json={"email": "new@example.com", "password": "newpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    # One call per admin phone, with the right code + params.
    assert len(calls) == 1
    api_key, sender, code, to, params = calls[0]
    assert api_key == API_KEY
    assert sender == SENDER
    assert code == "welcome9"
    assert to == PHONE
    assert params["title"] == "New user created"
    assert params["user_email"] == "new@example.com"
    assert params["role"] == "support"
    assert "license_key" not in params  # not provided by this event
    # The audit row records the pattern mode.
    rows = client.get("/api/audit-logs?channel=sms", headers=auth_headers).json()
    sent = [r for r in rows if r.get("action") == "notify.sms_sent"]
    assert sent, rows
    assert "pattern" in json.dumps(sent[0].get("details"))


def test_no_pattern_code_sends_webservice_with_edited_text(client, auth_headers, monkeypatch):
    calls = []
    monkeypatch.setattr(
        ippanel,
        "send_webservice",
        lambda api_key, sender, to, text: calls.append((api_key, sender, to, text)) or [1],
    )
    monkeypatch.setattr(
        ippanel, "send_pattern", lambda *a, **k: (_ for _ in ()).throw(AssertionError("pattern must not be called"))
    )
    _set_ippanel(client, auth_headers)
    _admin_phone(client, auth_headers)
    client.put(
        "/api/settings/notification-channels",
        json={"user_created": {"sms": True}},
        headers=auth_headers,
    )
    resp = client.put(
        "/api/settings/notification-texts",
        json={"user_created": {"sms": "Welcome {user_email} ({role})"}},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    resp = client.post(
        "/api/users",
        json={"email": "new@example.com", "password": "newpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert len(calls) == 1
    assert calls[0][2] == PHONE
    assert calls[0][3] == "Welcome new@example.com (support)"
    rows = client.get("/api/audit-logs?channel=sms", headers=auth_headers).json()
    sent = [r for r in rows if r.get("action") == "notify.sms_sent"]
    assert sent, rows
    assert "webservice" in json.dumps(sent[0].get("details"))


def test_pattern_code_ignored_when_ippanel_not_active(client, auth_headers, monkeypatch):
    """A stored code only applies when ippanel is the active provider:
    with no provider active nothing is sent at all (and the pattern
    function is never reached)."""
    calls = []
    monkeypatch.setattr(
        ippanel, "send_pattern", lambda *a, **k: calls.append(a) or [1]
    )
    _set_ippanel(client, auth_headers, active=False)
    _admin_phone(client, auth_headers)
    client.put(
        "/api/settings/notification-channels",
        json={"user_created": {"sms": True}},
        headers=auth_headers,
    )
    client.put(
        "/api/settings/notification-patterns",
        json={"user_created": "welcome9"},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/users",
        json={"email": "new@example.com", "password": "newpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert calls == []


def test_pattern_failure_never_breaks_the_triggering_action(client, auth_headers, monkeypatch):
    def _boom(*a, **k):
        raise ippanel.IppanelError("ippanel pattern send failed: boom")

    monkeypatch.setattr(ippanel, "send_pattern", _boom)
    _set_ippanel(client, auth_headers)
    _admin_phone(client, auth_headers)
    client.put(
        "/api/settings/notification-channels",
        json={"user_created": {"sms": True}},
        headers=auth_headers,
    )
    client.put(
        "/api/settings/notification-patterns",
        json={"user_created": "welcome9"},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/users",
        json={"email": "new@example.com", "password": "newpass123", "role": "support"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    # The failure is logged, not raised: an sms_failed row exists.
    rows = client.get("/api/audit-logs?channel=sms", headers=auth_headers).json()
    assert any(r.get("action") == "notify.sms_failed" for r in rows), rows


# --- test-send exercises the pattern path ---------------------------------


def test_sms_test_uses_pattern_when_code_set(client, auth_headers, monkeypatch):
    calls = []
    monkeypatch.setattr(
        ippanel,
        "send_pattern",
        lambda api_key, sender, code, to, params: calls.append(
            (api_key, sender, code, to, params)
        )
        or [1],
    )
    _set_ippanel(client, auth_headers)
    client.put(
        "/api/settings/notification-patterns",
        json={"license_created": "lic-new"},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/sms/test",
        json={"to": PHONE, "event": "license_created"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "sent": True,
        "provider": "ippanel",
        "mode": "pattern",
        "event": "license_created",
    }
    assert len(calls) == 1
    assert calls[0][2] == "lic-new"
    assert calls[0][3] == PHONE
    assert calls[0][4]["license_key"] == "LIC-DEMO-1234-5678"


def test_sms_test_without_pattern_uses_edited_text(client, auth_headers, monkeypatch):
    calls = []
    monkeypatch.setattr(
        ippanel,
        "send_webservice",
        lambda api_key, sender, to, text: calls.append((api_key, sender, to, text)) or [1],
    )
    _set_ippanel(client, auth_headers)
    client.put(
        "/api/settings/notification-texts",
        json={"license_created": {"sms": "NEW {license_key} — {title}"}},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/sms/test",
        json={"to": PHONE, "event": "license_created"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["mode"] == "webservice"
    assert resp.json()["sent"] is True
    assert len(calls) == 1
    assert calls[0][3] == "NEW LIC-DEMO-1234-5678 — License created"


def test_sms_test_rejects_unknown_event(client, auth_headers):
    _set_ippanel(client, auth_headers)
    resp = client.post(
        "/api/sms/test",
        json={"to": PHONE, "event": "no_such_event"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_sms_test_without_event_keeps_old_behavior(client, auth_headers, monkeypatch):
    calls = []
    monkeypatch.setattr(
        ippanel,
        "send_webservice",
        lambda api_key, sender, to, text: calls.append(text) or [1],
    )
    _set_ippanel(client, auth_headers)
    resp = client.post("/api/sms/test", json={"to": PHONE}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["mode"] == "webservice"
    assert resp.json()["event"] is None
    assert calls[0].startswith("Test SMS from LicenseManagerPro")
