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


def _login_as(client, email, password):
    """Log in as a second user; returns Authorization headers."""
    response = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_preferences_theme_isolated_per_user(client, auth_headers):
    """v3.0 per-admin themes: admin A picking ocean must not change
    admin B's theme, and vice versa — preferences are keyed by user."""
    created = client.post(
        "/api/users",
        json={"email": "second@example.com", "password": "secondpass123", "role": "admin"},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    second_headers = _login_as(client, "second@example.com", "secondpass123")

    put_a = client.put(
        "/api/users/me/preferences",
        json={"key": "theme", "value": {"preset": "ocean", "mode": "dark"}},
        headers=auth_headers,
    )
    assert put_a.status_code == 200, put_a.text
    put_b = client.put(
        "/api/users/me/preferences",
        json={"key": "theme", "value": {"preset": "forest", "mode": "light"}},
        headers=second_headers,
    )
    assert put_b.status_code == 200, put_b.text

    prefs_a = client.get("/api/users/me/preferences", headers=auth_headers).json()["preferences"]
    prefs_b = client.get("/api/users/me/preferences", headers=second_headers).json()["preferences"]
    assert prefs_a["theme"] == {"preset": "ocean", "mode": "dark"}
    assert prefs_b["theme"] == {"preset": "forest", "mode": "light"}


def test_preferences_theme_validation(client, auth_headers):
    """v3.0: unknown preset/mode, bad hex colour and unknown custom
    fields are rejected; a well-formed theme (incl. custom) is stored."""
    base = "/api/users/me/preferences"
    assert (
        client.put(base, json={"key": "theme", "value": {"preset": "nope"}}, headers=auth_headers).status_code
        == 400
    )
    assert (
        client.put(base, json={"key": "theme", "value": {"mode": "sepia"}}, headers=auth_headers).status_code
        == 400
    )
    assert (
        client.put(
            base,
            json={"key": "theme", "value": {"custom": {"accent": "red"}}},
            headers=auth_headers,
        ).status_code
        == 400
    )
    assert (
        client.put(
            base,
            json={"key": "theme", "value": {"custom": {"evil": "#FFFFFF"}}},
            headers=auth_headers,
        ).status_code
        == 400
    )
    assert (
        client.put(
            base,
            json={"key": "theme", "value": {"preset": "custom", "custom": {"accent": "#F43F5E"}}},
            headers=auth_headers,
        ).status_code
        == 200
    )
    # A non-theme key is unaffected by theme validation.
    assert (
        client.put(
            base,
            json={"key": "dashboard_layout", "value": {"order": ["summary"]}},
            headers=auth_headers,
        ).status_code
        == 200
    )


def test_preferences_theme_v305_presets_accepted(client, auth_headers):
    """v3.0.5: the 30 new theme presets (40 total) are accepted by the
    backend validation — the same ids the frontend THEME_PRESETS,
    the demo mock and THEME_PRESET_IDS carry. (Before this fix the
    backend list had only the first 10 + custom, so a new preset
    saved from Settings would 400 and never persist.)"""
    base = "/api/users/me/preferences"
    for preset in (
        "midnight", "coral", "mint", "sky", "plum",
        "gold", "crimson", "azure", "lavender", "slate",
        "citrine", "cyan", "pink", "fuchsia", "iris",
        "tangerine", "olive", "berry", "navy", "wine",
        "jade", "aqua", "magenta", "brick", "bronze",
        "steel", "blush", "moss", "apricot", "cobalt",
    ):
        assert (
            client.put(
                base,
                json={"key": "theme", "value": {"preset": preset}},
                headers=auth_headers,
            ).status_code
            == 200
        )
    prefs = client.get(base, headers=auth_headers).json()["preferences"]
    assert prefs["theme"]["preset"] == "cobalt"


def test_preferences_dashboard_layout_isolated_per_user(client, auth_headers):
    """v3.0.4 per-admin dashboard personalization: admin A hiding the
    trend widget and picking size S must not change admin B's layout —
    the dashboard layout is stored per user, like the theme."""
    created = client.post(
        "/api/users",
        json={"email": "second@example.com", "password": "secondpass123", "role": "admin"},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    second_headers = _login_as(client, "second@example.com", "secondpass123")

    layout_a = {"order": ["trend", "status"], "sizes": {"trend": "S"}, "hidden": {"trend": True}, "types": {"trend": "bar"}}
    layout_b = {"order": ["status", "trend"], "sizes": {"trend": "L"}, "hidden": {}, "types": {"trend": "area"}}
    put_a = client.put(
        "/api/users/me/preferences",
        json={"key": "dashboard", "value": layout_a},
        headers=auth_headers,
    )
    assert put_a.status_code == 200, put_a.text
    put_b = client.put(
        "/api/users/me/preferences",
        json={"key": "dashboard", "value": layout_b},
        headers=second_headers,
    )
    assert put_b.status_code == 200, put_b.text

    prefs_a = client.get("/api/users/me/preferences", headers=auth_headers).json()["preferences"]
    prefs_b = client.get("/api/users/me/preferences", headers=second_headers).json()["preferences"]
    assert prefs_a["dashboard"] == layout_a
    assert prefs_b["dashboard"] == layout_b
