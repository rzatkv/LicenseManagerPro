"""v3.0.4 permission refresh: every feature that needs access control
now has a permission entry, enforced server-side (403 without it).

Defaults preserve the access each endpoint had before, except the 2FA
model, which is main-admin-only by user decision:
- admin: everything ("*").
- manager: dashboard customization + widget/chart controls are per-user
  data (no permission needed); settings writes keep working via the
  granular sms/email/telegram/captcha/license-locking permissions;
  update-check + check-expiring keep working; NO 2FA-model change,
  NO notification-channels change, NO blacklist, NO roles/users
  management, NO self-update, NO dashboard stats, NO SMS balance.
- support: read everything + create/renew licenses + create API keys
  + download modules (downloads:read).
- viewer: read-only + download modules (downloads:read).
"""


def _login(client, email, password="userpass123"):
    response = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _make_user(client, auth_headers, email, role):
    response = client.post(
        "/api/users",
        json={"email": email, "password": "userpass123", "role": role},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _headers_for(client, auth_headers, email, role):
    _make_user(client, auth_headers, email, role)
    return _login(client, email)


def test_twofa_model_main_admin_only(client, auth_headers):
    """PUT /settings/twofa_channel: manager holds settings:write but
    must still get 403 — only the main admin (role admin) sets the 2FA
    model. Admin succeeds and the value sticks."""
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    response = client.put(
        "/api/settings/twofa_channel",
        json={"key": "twofa_channel", "value": "email"},
        headers=manager_headers,
    )
    assert response.status_code == 403, response.text
    # The manager's attempt changed nothing.
    current = client.get("/api/settings/twofa_channel", headers=auth_headers).json()
    assert current["value"] == "totp"
    response = client.put(
        "/api/settings/twofa_channel",
        json={"key": "twofa_channel", "value": "email"},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert client.get("/api/settings/twofa_channel", headers=auth_headers).json()["value"] == "email"


def test_license_security_needs_new_permission(client, auth_headers):
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    support_headers = _headers_for(client, auth_headers, "sup@example.com", "support")
    assert (
        client.put(
            "/api/settings/license-security",
            json={"lock_to_domain": True},
            headers=manager_headers,
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/settings/license-security",
            json={"lock_to_domain": False},
            headers=support_headers,
        ).status_code
        == 403
    )


def test_captcha_config_needs_new_permission(client, auth_headers):
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    support_headers = _headers_for(client, auth_headers, "sup@example.com", "support")
    assert (
        client.put(
            "/api/settings/captcha-config",
            json={"type": "off", "model": "math"},
            headers=manager_headers,
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/settings/captcha-config",
            json={"type": "off", "model": "math"},
            headers=support_headers,
        ).status_code
        == 403
    )


def test_sms_email_telegram_configs_need_new_permissions(client, auth_headers):
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    support_headers = _headers_for(client, auth_headers, "sup@example.com", "support")
    # Manager keeps the settings:write-era access via the granular perms.
    assert (
        client.put(
            "/api/settings/sms-config",
            json={
                "active_provider": "kavenegar",
                "providers": {"kavenegar": {"api_key": "SECRETKEY123", "sender": "1000"}},
            },
            headers=manager_headers,
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/settings/email-config",
            json={"signature": "Team"},
            headers=manager_headers,
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/settings/telegram-config",
            json={"bot_token": "123456:SECRET-TOKEN", "chat_ids": ["111"]},
            headers=manager_headers,
        ).status_code
        == 200
    )
    # Support has no settings write at all.
    assert (
        client.put(
            "/api/settings/sms-config",
            json={"active_provider": ""},
            headers=support_headers,
        ).status_code
        == 403
    )
    assert (
        client.put(
            "/api/settings/email-config",
            json={"signature": "x"},
            headers=support_headers,
        ).status_code
        == 403
    )
    assert (
        client.put(
            "/api/settings/telegram-config",
            json={},
            headers=support_headers,
        ).status_code
        == 403
    )


def test_notification_channels_admin_only(client, auth_headers):
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    matrix = {"license_created": {"email": True, "sms": False, "telegram": False}}
    assert (
        client.put(
            "/api/settings/notification-channels",
            json=matrix,
            headers=manager_headers,
        ).status_code
        == 403
    )
    assert (
        client.put(
            "/api/settings/notification-channels",
            json=matrix,
            headers=auth_headers,
        ).status_code
        == 200
    )


def test_blacklist_needs_new_permission(client, auth_headers):
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    assert (
        client.post(
            "/api/blacklist",
            json={"type": "ip", "value": "203.0.113.5"},
            headers=manager_headers,
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/blacklist",
            json={"type": "ip", "value": "203.0.113.5"},
            headers=auth_headers,
        ).status_code
        == 201
    )


def test_dashboard_stats_need_dashboard_read(client, auth_headers):
    """v3.0.6 (security, L14): dashboard:read used to exist in no role's
    set, so every non-admin got 403 on the dashboard — the panel's home
    page was admin-only. The dashboard is read-only data, so manager,
    support and viewer can read it now. The permission is still
    enforced: a custom role without it gets 403, anonymous gets 401."""
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    assert client.get("/api/dashboard/summary", headers=manager_headers).status_code == 200
    assert client.get("/api/dashboard/summary", headers=auth_headers).status_code == 200
    assert client.get("/api/system/service-status", headers=manager_headers).status_code == 200
    assert client.get("/api/system/sending-stats", headers=manager_headers).status_code == 200
    assert client.get("/api/dashboard/summary").status_code == 401
    # A custom role without dashboard:read is still refused.
    role = client.post(
        "/api/roles",
        json={"name": "No Dashboard", "permissions": ["licenses:create"]},
        headers=auth_headers,
    )
    assert role.status_code == 201, role.text
    created = client.post(
        "/api/users",
        json={"email": "nodash@example.com", "password": "userpass123", "role_id": role.json()["id"]},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    limited = _login(client, "nodash@example.com")
    assert client.get("/api/dashboard/summary", headers=limited).status_code == 403


def test_system_update_admin_only_and_update_check_manager_ok(client, auth_headers, monkeypatch):
    """POST /system/update: manager 403 (no network touched — the
    permission check runs before the handler). GET /update-check:
    manager allowed (system:update-check), support denied."""
    import tests.test_updates_downloads as upd_tests

    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    support_headers = _headers_for(client, auth_headers, "sup@example.com", "support")
    assert client.post("/api/system/update", headers=manager_headers).status_code == 403
    upd_tests._mock_client(monkeypatch)
    assert client.get("/api/system/update-check", headers=manager_headers).status_code == 200
    assert client.get("/api/system/update-check", headers=support_headers).status_code == 403
    assert client.get("/api/system/check-updates", headers=manager_headers).status_code == 200


def test_roles_crud_needs_roles_write(client, auth_headers):
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    assert client.get("/api/roles", headers=manager_headers).status_code == 403
    assert (
        client.post(
            "/api/roles",
            json={"name": "Nope", "permissions": []},
            headers=manager_headers,
        ).status_code
        == 403
    )
    assert client.get("/api/roles", headers=auth_headers).status_code == 200
    assert client.get("/api/roles/permissions", headers=auth_headers).status_code == 200


def test_users_list_delete_need_users_write(client, auth_headers):
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    assert client.get("/api/users", headers=manager_headers).status_code == 403
    assert client.get("/api/users", headers=auth_headers).status_code == 200


def test_downloads_require_downloads_read(client, auth_headers):
    """Viewer keeps module downloads (downloads:read in its defaults);
    a custom role without the permission gets 403."""
    viewer_headers = _headers_for(client, auth_headers, "view@example.com", "viewer")
    assert client.get("/api/downloads", headers=viewer_headers).status_code == 200
    assert client.get("/api/downloads/versions", headers=viewer_headers).status_code == 200
    # Custom role with no permissions at all.
    role = client.post(
        "/api/roles", json={"name": "NoDownloads", "permissions": []}, headers=auth_headers
    )
    assert role.status_code == 201, role.text
    user = client.post(
        "/api/users",
        json={"email": "nodl@example.com", "password": "userpass123", "role_id": role.json()["id"]},
        headers=auth_headers,
    )
    assert user.status_code == 201, user.text
    nodl_headers = _login(client, "nodl@example.com")
    assert client.get("/api/downloads", headers=nodl_headers).status_code == 403


def test_check_expiring_needs_permission(client, auth_headers):
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    support_headers = _headers_for(client, auth_headers, "sup@example.com", "support")
    assert client.post("/api/system/check-expiring", headers=manager_headers).status_code == 200
    assert client.post("/api/system/check-expiring", headers=support_headers).status_code == 403


def test_sms_balance_needs_sms_read(client, auth_headers):
    manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    assert client.get("/api/sms/balance", headers=manager_headers).status_code == 403
    assert client.get("/api/sms/balance", headers=auth_headers).status_code == 200


def test_all_permissions_listed(client, auth_headers):
    perms = client.get("/api/roles/permissions", headers=auth_headers).json()
    assert isinstance(perms, list)
    assert len(perms) == 27
    for key in (
        "security:twofa-model",
        "security:license-locking",
        "security:captcha",
        "sms:write",
        "sms:read",
        "email:write",
        "telegram:write",
        "notifications:write",
        "blacklist:write",
        "dashboard:read",
        "system:update",
        "system:update-check",
    ):
        assert key in perms, key


def test_custom_role_with_granted_permission_can_use_it(client, auth_headers):
    """A custom role granted blacklist:write can manage the blacklist —
    the permission is real, not admin-name-only."""
    role = client.post(
        "/api/roles",
        json={"name": "Blocker", "permissions": ["blacklist:write"]},
        headers=auth_headers,
    )
    assert role.status_code == 201, role.text
    user = client.post(
        "/api/users",
        json={"email": "blocker@example.com", "password": "userpass123", "role_id": role.json()["id"]},
        headers=auth_headers,
    )
    assert user.status_code == 201, user.text
    headers = _login(client, "blocker@example.com")
    assert (
        client.post(
            "/api/blacklist",
            json={"type": "ip", "value": "198.51.100.7"},
            headers=headers,
        ).status_code
        == 201
    )
    # ...but the same role cannot touch the 2FA model (main admin only).
    assert (
        client.put(
            "/api/settings/twofa_channel",
            json={"key": "twofa_channel", "value": "sms"},
            headers=headers,
        ).status_code
        == 403
    )
