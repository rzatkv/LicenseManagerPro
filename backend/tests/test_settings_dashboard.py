"""Settings, dashboard and system tests."""


def test_settings_crud(client, auth_headers):
    response = client.get("/api/settings", headers=auth_headers)
    assert response.status_code == 200
    settings = response.json()
    assert settings["daily_request_limit"] == "100"
    assert settings["app_version"] == "1.0.0"

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
    assert response.json()["version"] == "1.0.0"
    assert response.json()["lastUpdated"]

    response = client.get("/api/system/check-updates", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["updateAvailable"] is False

    # Publish a newer version via the settings, then an update is available.
    client.put(
        "/api/settings/latest_version",
        json={"key": "latest_version", "value": "1.1.0"},
        headers=auth_headers,
    )
    response = client.get("/api/system/check-updates", headers=auth_headers)
    assert response.json()["updateAvailable"] is True
    assert response.json()["latestVersion"] == "1.1.0"

    response = client.post("/api/system/update", headers=auth_headers)
    assert response.status_code == 200
    assert "1.1.0" in response.json()["message"]

    response = client.get("/api/system/info", headers=auth_headers)
    assert response.json()["version"] == "1.1.0"
    response = client.get("/api/system/check-updates", headers=auth_headers)
    assert response.json()["updateAvailable"] is False


def test_system_update_when_up_to_date(client, auth_headers):
    response = client.post("/api/system/update", headers=auth_headers)
    assert response.status_code == 200
    assert "up to date" in response.json()["message"].lower()
