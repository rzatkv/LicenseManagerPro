"""Settings, dashboard and system tests."""


def test_settings_crud(client, auth_headers):
    response = client.get("/api/settings", headers=auth_headers)
    assert response.status_code == 200
    settings = response.json()
    assert settings["daily_request_limit"] == "100"
    assert settings["app_version"] == "2.2.2"

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


def test_settings_delete(client, auth_headers):
    # Deleting an existing key returns 200 and the key is gone afterwards.
    response = client.put(
        "/api/settings/demo_key",
        json={"key": "demo_key", "value": "demo_value"},
        headers=auth_headers,
    )
    assert response.status_code == 200

    response = client.delete("/api/settings/demo_key", headers=auth_headers)
    assert response.status_code == 200
    assert "deleted" in response.json()["message"]

    response = client.get("/api/settings/demo_key", headers=auth_headers)
    assert response.status_code == 404

    # Deleting a missing key returns 404.
    response = client.delete("/api/settings/no-such-key", headers=auth_headers)
    assert response.status_code == 404

    # Deleting without a token returns 401.
    response = client.delete("/api/settings/daily_request_limit")
    assert response.status_code == 401


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
    assert response.json()["version"] == "2.2.2"
    assert response.json()["lastUpdated"]

    response = client.get("/api/system/check-updates", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["updateAvailable"] is False

    # Publish a newer version via the settings, then an update is available.
    client.put(
        "/api/settings/latest_version",
        json={"key": "latest_version", "value": "2.3.0"},
        headers=auth_headers,
    )
    response = client.get("/api/system/check-updates", headers=auth_headers)
    assert response.json()["updateAvailable"] is True
    assert response.json()["latestVersion"] == "2.3.0"


def test_system_update_when_up_to_date(client, auth_headers, monkeypatch):
    """POST /system/update with no newer release stages nothing (400)."""
    import services.updates as update_service

    # Mock the GitHub API: the latest release is the running version.
    import httpx

    def handler(request):
        return httpx.Response(
            200,
            json={
                "tag_name": "v2.2.2",
                "html_url": "https://github.com/rzatkv/LicenseManagerPro/releases/tag/v2.2.2",
                "body": "no changes",
                "published_at": "2026-11-25T00:00:00Z",
                "tarball_url": "https://api.github.com/repos/rzatkv/LicenseManagerPro/tarball/v2.2.2",
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
