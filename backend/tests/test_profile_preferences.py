"""Profile self-update + per-user preferences (v2.3)."""


def test_update_my_profile(client, auth_headers):
    response = client.put(
        "/api/users/me",
        json={"display_name": "Reza Admin", "avatar_url": "data:image/png;base64,AAA"},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["display_name"] == "Reza Admin"
    assert body["avatar_url"] == "data:image/png;base64,AAA"
    # Role cannot be changed through the profile endpoint.
    assert body["role"] == "admin"
    me = client.get("/api/users/me", headers=auth_headers).json()
    assert me["display_name"] == "Reza Admin"
    assert me["last_login_at"] is not None  # set at login


def test_profile_update_ignores_role_change(client, auth_headers):
    response = client.put(
        "/api/users/me",
        json={"role": "viewer", "role_id": None},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_preferences_roundtrip(client, auth_headers):
    empty = client.get("/api/users/me/preferences", headers=auth_headers)
    assert empty.status_code == 200
    assert empty.json() == {"preferences": {}}
    put = client.put(
        "/api/users/me/preferences",
        json={"key": "theme", "value": {"preset": "ocean", "mode": "dark"}},
        headers=auth_headers,
    )
    assert put.status_code == 200
    assert put.json()["preferences"]["theme"] == {"preset": "ocean", "mode": "dark"}
    put2 = client.put(
        "/api/users/me/preferences",
        json={"key": "dashboard_layout", "value": {"order": ["summary", "trend"]}},
        headers=auth_headers,
    )
    prefs = put2.json()["preferences"]
    assert prefs["theme"]["preset"] == "ocean"
    assert prefs["dashboard_layout"]["order"] == ["summary", "trend"]


def test_preferences_require_auth(client):
    assert client.get("/api/users/me/preferences").status_code == 401
    assert (
        client.put("/api/users/me/preferences", json={"key": "theme", "value": {}}).status_code
        == 401
    )
