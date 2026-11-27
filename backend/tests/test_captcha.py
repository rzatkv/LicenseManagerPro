"""CAPTCHA (v3.0): custom challenges + reCAPTCHA verify + login gating."""
import httpx
import pytest

from database import SessionLocal
from services import captcha as captcha_service


def _set_config(patch):
    db = SessionLocal()
    try:
        return captcha_service.set_captcha_config(db, patch)
    finally:
        db.close()


def _login(client, **extra):
    body = {"email": "admin@example.com", "password": "adminpass123"}
    body.update(extra)
    return client.post("/api/auth/login", json=body)


def test_custom_challenge_valid_wrong_reused_expired():
    ch = captcha_service.generate_challenge("math")
    assert ch["challenge_id"] and ch["display"] and ch["prompt"]
    # Wrong answer fails and consumes the challenge.
    assert captcha_service.verify_custom_challenge(ch["challenge_id"], "not-the-answer") is False
    # Reuse fails (single-use).
    assert captcha_service.verify_custom_challenge(ch["challenge_id"], "x") is False

    # Valid answer passes once, then the challenge is gone.
    ch2 = captcha_service.generate_challenge("reverse")
    # The answer is the display reversed; recompute from the service store.
    stored = captcha_service._challenges[ch2["challenge_id"]]
    assert captcha_service.verify_custom_challenge(ch2["challenge_id"], stored[0]) is True
    assert captcha_service.verify_custom_challenge(ch2["challenge_id"], stored[0]) is False

    # Expired challenge fails.
    ch3 = captcha_service.generate_challenge("text")
    captcha_service._challenges[ch3["challenge_id"]] = (
        captcha_service._challenges[ch3["challenge_id"]][0],
        0,  # expires_at in the past
    )
    assert captcha_service.verify_custom_challenge(ch3["challenge_id"], "whatever") is False

    # Unknown id fails.
    assert captcha_service.verify_custom_challenge("no-such-id", "1") is False


def test_public_config_never_exposes_secret(client, auth_headers):
    _set_config({"type": "recaptcha-v2", "site_key": "site-123", "secret_key": "shh-secret"})
    resp = client.get("/api/captcha/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "recaptcha-v2"
    assert data["site_key"] == "site-123"
    assert "shh-secret" not in resp.text
    assert data["secret_configured"] is True
    # Admin config endpoint also hides the secret value.
    resp = client.get("/api/settings/captcha-config", headers=auth_headers)
    assert resp.status_code == 200
    assert "shh-secret" not in resp.text
    # And the generic settings API never returns captcha_config at all.
    resp = client.get("/api/settings", headers=auth_headers)
    assert "captcha_config" not in resp.json()
    _set_config({"type": "off", "secret_key": "__CLEAR__"})


def test_login_with_custom_captcha(client, auth_headers):
    _set_config({"type": "custom", "model": "math"})
    # No captcha fields -> 400.
    resp = _login(client)
    assert resp.status_code == 400
    # Challenge endpoint mints one.
    resp = client.post("/api/captcha/challenge")
    assert resp.status_code == 200
    ch = resp.json()
    # Wrong answer -> 400, and the challenge is consumed.
    resp = _login(client, captcha_challenge_id=ch["challenge_id"], captcha_answer="wrong")
    assert resp.status_code == 400
    # Fresh challenge + correct answer (read from the store, as a test may).
    resp = client.post("/api/captcha/challenge")
    ch = resp.json()
    answer = captcha_service._challenges[ch["challenge_id"]][0]
    resp = _login(client, captcha_challenge_id=ch["challenge_id"], captcha_answer=answer)
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]
    _set_config({"type": "off"})


def test_login_captcha_off_by_default(client, auth_headers):
    # Default config is off: plain login works with no captcha fields.
    # (auth_headers is needed: the client fixture drops the tables, so
    # without it no admin user exists at all.)
    resp = _login(client)
    assert resp.status_code == 200, resp.text


def test_recaptcha_verify_mocked(monkeypatch):
    # v2: Google success=true passes; success=false fails.
    def ok_handler(request):
        return httpx.Response(200, json={"success": True})

    def bad_handler(request):
        return httpx.Response(200, json={"success": False, "error-codes": ["invalid-input-response"]})

    monkeypatch.setattr(
        captcha_service, "create_recaptcha_client",
        lambda: httpx.Client(transport=httpx.MockTransport(ok_handler), timeout=10, trust_env=False),
    )
    assert captcha_service.verify_recaptcha("secret", "token", None) is True
    monkeypatch.setattr(
        captcha_service, "create_recaptcha_client",
        lambda: httpx.Client(transport=httpx.MockTransport(bad_handler), timeout=10, trust_env=False),
    )
    assert captcha_service.verify_recaptcha("secret", "token", None) is False

    # v3: score below the threshold fails even when success=true.
    def low_score(request):
        return httpx.Response(200, json={"success": True, "score": 0.1})

    def high_score(request):
        return httpx.Response(200, json={"success": True, "score": 0.9})

    monkeypatch.setattr(
        captcha_service, "create_recaptcha_client",
        lambda: httpx.Client(transport=httpx.MockTransport(low_score), timeout=10, trust_env=False),
    )
    assert captcha_service.verify_recaptcha("secret", "token", 0.5) is False
    monkeypatch.setattr(
        captcha_service, "create_recaptcha_client",
        lambda: httpx.Client(transport=httpx.MockTransport(high_score), timeout=10, trust_env=False),
    )
    assert captcha_service.verify_recaptcha("secret", "token", 0.5) is True

    # No secret / no token / network error all fail closed.
    assert captcha_service.verify_recaptcha("", "token", None) is False
    assert captcha_service.verify_recaptcha("secret", None, None) is False


def test_recaptcha_login_mocked(client, auth_headers, monkeypatch):
    _set_config({"type": "recaptcha-v2", "site_key": "site", "secret_key": "sec"})

    def ok_handler(request):
        return httpx.Response(200, json={"success": True})

    monkeypatch.setattr(
        captcha_service, "create_recaptcha_client",
        lambda: httpx.Client(transport=httpx.MockTransport(ok_handler), timeout=10, trust_env=False),
    )
    resp = _login(client, captcha_token="valid-token")
    assert resp.status_code == 200, resp.text
    # Missing token fails.
    resp = _login(client)
    assert resp.status_code == 400
    _set_config({"type": "off", "secret_key": "__CLEAR__"})


def test_captcha_admin_config_validation(client, auth_headers):
    resp = client.put(
        "/api/settings/captcha-config",
        json={"type": "nope"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    resp = client.put(
        "/api/settings/captcha-config",
        json={"type": "custom", "model": "math", "v3_threshold": 0.7},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["v3_threshold"] == 0.7


def test_challenge_minting_prunes_expired_entries(monkeypatch):
    """v3.0.6 (security, L3): expired challenges used to stay in the
    in-memory store forever (only verified ones were removed). Minting
    a new challenge now prunes the expired ones."""
    from services import captcha as captcha_service

    captcha_service._challenges.clear()
    captcha_service._challenges["stale-id"] = ("1234", 1.0)  # long expired
    captcha_service._challenges["live-id"] = ("5678", 9999999999.0)
    captcha_service.generate_challenge("math")
    assert "stale-id" not in captcha_service._challenges
    assert "live-id" in captcha_service._challenges
    captcha_service._challenges.clear()


def test_challenge_endpoint_is_rate_limited(client):
    """v3.0.6 (security, L3): minting challenges was unauthenticated
    and unrate-limited — an attacker could grow the challenge store
    without bound. 10/min per IP; the 11th mint is refused."""
    from utils import rate_limit

    rate_limit._hits.clear()
    statuses = []
    for _ in range(11):
        statuses.append(client.post("/api/captcha/challenge").status_code)
    assert statuses[:10] == [200] * 10, statuses
    assert statuses[10] == 429, statuses
