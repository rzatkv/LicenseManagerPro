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
