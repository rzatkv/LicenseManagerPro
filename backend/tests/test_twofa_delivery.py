"""2FA codes via email/SMS (v3.0): delivery, single-use, TTL, attempts."""
import pytest

from services import twofa_delivery as delivery


def _set_channel(client, auth_headers, channel):
    resp = client.put(
        "/api/settings/twofa_channel",
        json={"key": "twofa_channel", "value": channel},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text


def _user_id(client, auth_headers):
    resp = client.get("/api/users", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()[0]["id"]


def _enable_totp(client, auth_headers):
    """Enable TOTP for the admin via the setup/verify flow (uses the
    real TOTP service); returns the secret."""
    resp = client.post("/api/auth/2fa/setup", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    secret = resp.json()["secret"]
    import pyotp

    code = pyotp.TOTP(secret).now()
    resp = client.post(
        "/api/auth/2fa/verify", json={"code": code}, headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    return secret


def test_email_code_flow(client, auth_headers, monkeypatch):
    """Email channel: login sends a code (mail mocked), verify-2fa
    accepts it once, then rejects reuse."""
    sent = []

    def fake_send_mail(db, to, subject, body):
        sent.append((to, subject, body))
        return True

    monkeypatch.setattr("services.mail.send_mail", fake_send_mail)
    _enable_totp(client, auth_headers)
    _set_channel(client, auth_headers, "email")

    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["requires_2fa"] is True
    assert resp.json()["twofa_channel"] == "email"
    assert len(sent) == 1
    assert sent[0][0] == "admin@example.com"

    code = delivery.pending_code_for(_user_id(client, auth_headers))
    assert code and len(code) == 6
    temp = resp.json()["temp_token"]
    resp = client.post(
        "/api/auth/verify-2fa", json={"temp_token": temp, "code": code}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]
    # Reuse fails (single-use).
    resp = client.post(
        "/api/auth/verify-2fa", json={"temp_token": temp, "code": code}
    )
    assert resp.status_code == 401


def test_email_code_wrong_code_fails(client, auth_headers, monkeypatch):
    monkeypatch.setattr("services.mail.send_mail", lambda db, to, s, b: True)
    _enable_totp(client, auth_headers)
    _set_channel(client, auth_headers, "email")
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    temp = resp.json()["temp_token"]
    resp = client.post(
        "/api/auth/verify-2fa", json={"temp_token": temp, "code": "000000"}
    )
    assert resp.status_code == 401


def test_sms_code_requires_phone(client, auth_headers, monkeypatch):
    """SMS channel with no phone on the account: login fails with a
    clear error (400), no temp token is issued."""
    monkeypatch.setattr("services.sms.send_sms", lambda db, to, t: True)
    _enable_totp(client, auth_headers)
    _set_channel(client, auth_headers, "sms")
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert resp.status_code == 400
    assert "phone" in resp.text.lower()


def test_sms_code_flow_with_phone(client, auth_headers, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "services.sms.send_sms",
        lambda db, to, text: sent.append((to, text)) or True,
    )
    # Give the admin a phone number.
    uid = _user_id(client, auth_headers)
    resp = client.put(
        f"/api/users/{uid}", json={"phone": "+989121234567"}, headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    _enable_totp(client, auth_headers)
    _set_channel(client, auth_headers, "sms")
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["twofa_channel"] == "sms"
    assert len(sent) == 1
    assert sent[0][0] == "+989121234567"
    code = delivery.pending_code_for(uid)
    resp = client.post(
        "/api/auth/verify-2fa",
        json={"temp_token": resp.json()["temp_token"], "code": code},
    )
    assert resp.status_code == 200, resp.text


def test_attempts_limit(client, auth_headers, monkeypatch):
    """5 wrong attempts exhaust the code (the 6th verify fails with 429 —
    locked out — even with the right code)."""
    monkeypatch.setattr("services.mail.send_mail", lambda db, to, s, b: True)
    _enable_totp(client, auth_headers)
    _set_channel(client, auth_headers, "email")
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    temp = resp.json()["temp_token"]
    uid = _user_id(client, auth_headers)
    code = delivery.pending_code_for(uid)
    for _ in range(5):
        resp = client.post(
            "/api/auth/verify-2fa", json={"temp_token": temp, "code": "000000"}
        )
        assert resp.status_code == 401
    resp = client.post(
        "/api/auth/verify-2fa", json={"temp_token": temp, "code": code}
    )
    assert resp.status_code == 429


def test_totp_channel_unchanged(client, auth_headers):
    """Default channel (totp): login returns requires_2fa with the
    totp channel and the TOTP code still works."""
    import pyotp

    secret = _enable_totp(client, auth_headers)
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert resp.status_code == 200
    assert resp.json()["twofa_channel"] == "totp"
    code = pyotp.TOTP(secret).now()
    resp = client.post(
        "/api/auth/verify-2fa",
        json={"temp_token": resp.json()["temp_token"], "code": code},
    )
    assert resp.status_code == 200, resp.text
