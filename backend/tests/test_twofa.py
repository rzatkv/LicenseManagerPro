"""TOTP two-factor authentication (v2.3): setup, enable, login, disable."""

import pyotp


def _enable_2fa(client, auth_headers):
    """Run setup + verify for the logged-in user; returns backup codes."""
    setup = client.post("/api/auth/2fa/setup", headers=auth_headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_url"].startswith("otpauth://")
    assert setup.json()["qr_data_url"].startswith("data:image/png;base64,")
    verify = client.post(
        "/api/auth/2fa/verify",
        json={"code": pyotp.TOTP(secret).now()},
        headers=auth_headers,
    )
    assert verify.status_code == 200, verify.text
    codes = verify.json()["backup_codes"]
    assert len(codes) == 8
    return secret, codes


def test_setup_requires_verification_before_enabled(client, auth_headers):
    setup = client.post("/api/auth/2fa/setup", headers=auth_headers)
    assert setup.status_code == 200
    # Still disabled until a code is verified.
    status = client.get("/api/auth/2fa/status", headers=auth_headers)
    assert status.json()["enabled"] is False
    # A wrong code does not enable it.
    assert (
        client.post(
            "/api/auth/2fa/verify", json={"code": "000000"}, headers=auth_headers
        ).status_code
        == 400
    )
    status = client.get("/api/auth/2fa/status", headers=auth_headers)
    assert status.json()["enabled"] is False


def test_enable_and_login_with_totp(client, auth_headers):
    secret, _codes = _enable_2fa(client, auth_headers)
    status = client.get("/api/auth/2fa/status", headers=auth_headers)
    assert status.json()["enabled"] is True
    assert status.json()["backup_codes_remaining"] == 8

    # Password-only login now returns requires_2fa + a temp token, no JWT.
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert login.status_code == 200
    body = login.json()
    assert body["requires_2fa"] is True
    assert body["access_token"] == ""
    temp_token = body["temp_token"]

    # The temp token is NOT an access token.
    assert (
        client.get("/api/users/me", headers={"Authorization": f"Bearer {temp_token}"}).status_code
        == 401
    )

    # A wrong code is rejected.
    assert (
        client.post(
            "/api/auth/verify-2fa", json={"temp_token": temp_token, "code": "000000"}
        ).status_code
        == 401
    )

    # The correct TOTP code exchanges for a real JWT.
    ok = client.post(
        "/api/auth/verify-2fa",
        json={"temp_token": temp_token, "code": pyotp.TOTP(secret).now()},
    )
    assert ok.status_code == 200, ok.text
    token = ok.json()["access_token"]
    assert token
    me = client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["totp_enabled"] is True


def test_backup_code_login_consumes_code(client, auth_headers):
    _secret, codes = _enable_2fa(client, auth_headers)
    backup = codes[0]
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    temp_token = login.json()["temp_token"]
    ok = client.post(
        "/api/auth/verify-2fa",
        json={"temp_token": temp_token, "code": backup},
    )
    assert ok.status_code == 200, ok.text
    headers = {"Authorization": f"Bearer {ok.json()['access_token']}"}
    assert client.get("/api/auth/2fa/status", headers=headers).json()["backup_codes_remaining"] == 7
    # The same backup code cannot be reused.
    login2 = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert (
        client.post(
            "/api/auth/verify-2fa",
            json={"temp_token": login2.json()["temp_token"], "code": backup},
        ).status_code
        == 401
    )


def test_disable_requires_password_and_code(client, auth_headers):
    secret, _codes = _enable_2fa(client, auth_headers)
    # Wrong password -> 401.
    assert (
        client.post(
            "/api/auth/2fa/disable",
            json={"password": "wrongpass", "code": pyotp.TOTP(secret).now()},
            headers=auth_headers,
        ).status_code
        == 401
    )
    # Wrong code -> 400.
    assert (
        client.post(
            "/api/auth/2fa/disable",
            json={"password": "adminpass123", "code": "000000"},
            headers=auth_headers,
        ).status_code
        == 400
    )
    # Correct pair disables.
    assert (
        client.post(
            "/api/auth/2fa/disable",
            json={"password": "adminpass123", "code": pyotp.TOTP(secret).now()},
            headers=auth_headers,
        ).status_code
        == 200
    )
    assert client.get("/api/auth/2fa/status", headers=auth_headers).json()["enabled"] is False
    # Login is back to password-only.
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert login.json()["requires_2fa"] is False
    assert login.json()["access_token"]


def test_verify_2fa_with_bad_temp_token(client):
    assert (
        client.post(
            "/api/auth/verify-2fa", json={"temp_token": "garbage", "code": "123456"}
        ).status_code
        == 401
    )


def test_twofa_isolated_per_user(client, auth_headers):
    """v3.0.4 per-admin 2FA: enabling TOTP for admin A must not enable
    it for admin B — the secret and backup codes live on the user row."""
    _enable_2fa(client, auth_headers)
    created = client.post(
        "/api/users",
        json={"email": "second@example.com", "password": "secondpass123", "role": "admin"},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    second_headers = {
        "Authorization": f"Bearer {client.post('/api/auth/login', json={'email': 'second@example.com', 'password': 'secondpass123'}).json()['access_token']}"
    }
    assert client.get("/api/auth/2fa/status", headers=auth_headers).json()["enabled"] is True
    assert client.get("/api/auth/2fa/status", headers=second_headers).json()["enabled"] is False
    # B still logs in with password alone (no 2FA challenge).
    login = client.post(
        "/api/auth/login",
        json={"email": "second@example.com", "password": "secondpass123"},
    )
    assert login.status_code == 200
    assert login.json().get("requires_2fa") is not True


def test_temp_token_cannot_register_admin(client, auth_headers):
    """v3.0.6 (security, H1): a 2FA temp token must never authenticate
    register() — before the fix it passed the admin check and created
    an admin user with no 2FA, defeating the second factor entirely."""
    _secret, _codes = _enable_2fa(client, auth_headers)
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert login.status_code == 200
    temp_token = login.json()["temp_token"]
    assert temp_token
    attempt = client.post(
        "/api/auth/register",
        json={"email": "attacker@example.com", "password": "attackerpass123", "role": "admin"},
        headers={"Authorization": f"Bearer {temp_token}"},
    )
    assert attempt.status_code == 401, attempt.text
    # And no user was created: the attacker cannot log in as one.
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "attacker@example.com", "password": "attackerpass123"},
        ).status_code
        == 401
    )


def test_deactivated_admin_token_cannot_register(client, auth_headers):
    """v3.0.6 (security, H1): a deactivated admin's token must not
    authenticate register() either — _optional_user now checks
    is_active, like get_current_user."""
    me = client.get("/api/users/me", headers=auth_headers)
    assert me.status_code == 200
    admin_id = me.json()["id"]
    off = client.put(
        f"/api/users/{admin_id}", json={"is_active": False}, headers=auth_headers
    )
    assert off.status_code == 200, off.text
    attempt = client.post(
        "/api/auth/register",
        json={"email": "attacker@example.com", "password": "attackerpass123", "role": "admin"},
        headers=auth_headers,
    )
    assert attempt.status_code == 401, attempt.text


def test_verify_2fa_locks_account_after_five_wrong_codes(client, auth_headers):
    """v3.0.6 (security, M6): verify-2fa had no per-account attempt cap
    — only the 5/min per-IP limit, so a distributed attacker could
    guess unlimited TOTP codes against one account. Five wrong codes
    now lock the account for 15 minutes (the same lockout as failed
    logins); the 6th attempt gets 429 even from a fresh IP."""
    from utils import rate_limit

    _enable_2fa(client, auth_headers)
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert login.status_code == 200, login.text
    temp_token = login.json()["temp_token"]
    for _ in range(5):
        resp = client.post(
            "/api/auth/verify-2fa", json={"temp_token": temp_token, "code": "000000"}
        )
        assert resp.status_code == 401, resp.text
        # Clear only the per-IP bucket: the per-account lock must be
        # what stops the 6th attempt, not the 5/min IP limit.
        rate_limit._hits.clear()
    locked = client.post(
        "/api/auth/verify-2fa", json={"temp_token": temp_token, "code": "000000"}
    )
    assert locked.status_code == 429, locked.text
