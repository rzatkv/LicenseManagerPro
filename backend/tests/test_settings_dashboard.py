"""Settings, dashboard and system tests."""


def test_settings_crud(client, auth_headers):
    response = client.get("/api/settings", headers=auth_headers)
    assert response.status_code == 200
    settings = response.json()
    assert settings["daily_request_limit"] == "100"
    assert settings["app_version"] == "3.0.5"

    response = client.put(
        "/api/settings/daily_request_limit",
        json={"key": "daily_request_limit", "value": "250"},
        headers=auth_headers,
    )
    assert response.status_code == 200

    response = client.get("/api/settings/daily_request_limit", headers=auth_headers)
    assert response.json()["value"] == "250"

    response = client.get("/api/settings/no-such-key", headers=auth_headers)
    assert response.status_code == 404


def test_settings_create_and_delete_are_gone(client, auth_headers):
    """v3.0: settings are predefined — creating an arbitrary setting is
    rejected (404) and the DELETE endpoint no longer exists: DELETE on
    the settings path answers 405 (the path exists for GET/PUT, the
    DELETE method does not), which proves deletion is impossible for
    anyone, admin included."""
    # Creating an arbitrary setting via PUT is rejected.
    response = client.put(
        "/api/settings/demo_key",
        json={"key": "demo_key", "value": "demo_value"},
        headers=auth_headers,
    )
    assert response.status_code == 404

    # System-managed keys cannot be edited either.
    response = client.put(
        "/api/settings/app_version",
        json={"key": "app_version", "value": "9.9.9"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    response = client.put(
        "/api/settings/latest_version",
        json={"key": "latest_version", "value": "9.9.9"},
        headers=auth_headers,
    )
    assert response.status_code == 400

    # Deleting a setting is impossible: no DELETE method exists on the
    # settings path at all (405 Method Not Allowed, for any caller).
    response = client.delete("/api/settings/demo_key", headers=auth_headers)
    assert response.status_code == 405
    response = client.delete("/api/settings/daily_request_limit", headers=auth_headers)
    assert response.status_code == 405

    # Updating a KNOWN setting still works.
    response = client.put(
        "/api/settings/daily_request_limit",
        json={"key": "daily_request_limit", "value": "250"},
        headers=auth_headers,
    )
    assert response.status_code == 200


def test_panel_domain_validation(client, auth_headers):
    """v3.0: panel_domain must be a valid hostname; invalid values 400."""
    for bad in ["not a domain", "http://example.com", "example.com:8080", "exa_mple.com", "-bad.example.com", "a/b"]:
        response = client.put(
            "/api/settings/panel_domain",
            json={"key": "panel_domain", "value": bad},
            headers=auth_headers,
        )
        assert response.status_code == 400, bad
    for good in ["panel.example.com", "localhost", ""]:
        response = client.put(
            "/api/settings/panel_domain",
            json={"key": "panel_domain", "value": good},
            headers=auth_headers,
        )
        assert response.status_code == 200, good
    response = client.get("/api/settings/panel_domain", headers=auth_headers)
    assert response.json()["value"] == ""


def test_settings_key_mismatch_rejected(client, auth_headers):
    response = client.put(
        "/api/settings/foo",
        json={"key": "bar", "value": "1"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_dashboard_summary(client, auth_headers):
    client.post(
        "/api/api-keys",
        json={"access_rights": ["get_license_info"]},
        headers=auth_headers,
    )
    client.post(
        "/api/licenses", json={"product": "Widget"}, headers=auth_headers
    )
    client.post(
        "/api/licenses",
        json={"product": "Gadget", "status": "inactive"},
        headers=auth_headers,
    )
    response = client.get("/api/dashboard/summary", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["apiKeysCount"] == 1
    assert data["usersCount"] == 1
    assert data["activeLicenses"] == 1
    assert data["inactiveLicenses"] == 1


def test_system_info_and_check_updates(client, auth_headers):
    response = client.get("/api/system/info", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["version"] == "3.0.5"
    assert response.json()["lastUpdated"]
    # v3.0.2: full stack — every field present and non-empty, all live
    # runtime values (the test suite runs on SQLite, so the engine is
    # sqlite and the server version is the SQLite version string).
    info = response.json()
    for field in (
        "python_version",
        "fastapi_version",
        "sqlalchemy_version",
        "pydantic_version",
        "database_engine",
        "database_version",
        "os",
    ):
        assert info[field], field
    assert info["database_engine"] == "sqlite"
    assert info["python_version"].startswith("3.")
    assert info["os"].startswith("Linux")

    response = client.get("/api/system/check-updates", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["updateAvailable"] is False

    # Publish a newer version the way the system itself does (the update
    # flow writes latest_version; users cannot PUT it any more, v3.0).
    from database import SessionLocal
    from services.settings import update_setting

    db = SessionLocal()
    try:
        update_setting(db, "latest_version", "3.0.6")
    finally:
        db.close()
    response = client.get("/api/system/check-updates", headers=auth_headers)
    assert response.json()["updateAvailable"] is True
    assert response.json()["latestVersion"] == "3.0.6"


def test_system_update_when_up_to_date(client, auth_headers, monkeypatch):
    """POST /system/update with no newer release stages nothing (400)."""
    # Mock the GitHub API: the latest release is the running version.
    import httpx

    import services.updates as update_service

    def handler(request):
        return httpx.Response(
            200,
            json={
                "tag_name": "v3.0.5",
                "html_url": "https://github.com/rzatkv/LicenseManagerPro/releases/tag/v3.0.5",
                "body": "no changes",
                "published_at": "2026-11-25T00:00:00Z",
                "tarball_url": "https://api.github.com/repos/rzatkv/LicenseManagerPro/tarball/v3.0.5",
            },
        )

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        update_service,
        "create_github_client",
        lambda: httpx.Client(transport=transport, timeout=10, trust_env=False),
    )
    response = client.post("/api/system/update", headers=auth_headers)
    assert response.status_code == 400
    assert "up to date" in response.json()["detail"].lower()
