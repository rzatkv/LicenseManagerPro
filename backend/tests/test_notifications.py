"""Notifications tests (v2.2)."""


def _login_as(client, auth_headers, email, password, role):
    # Register is admin-only after bootstrap, so the user is created
    # through the admin users endpoint, then logged in normally.
    response = client.post(
        "/api/users",
        json={"email": email, "password": password, "role": role},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return client.post(
        "/api/auth/login", json={"email": email, "password": password}
    ).json()["access_token"]


def test_license_create_creates_notification(client, auth_headers):
    response = client.post(
        "/api/licenses", json={"product": "Widget"}, headers=auth_headers
    )
    assert response.status_code == 201
    key = response.json()["key"]

    response = client.get("/api/notifications", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["unread"] == 1
    note = data["notifications"][0]
    assert note["type"] == "success"
    assert key in note["message"]
    assert note["link"] == "/licenses"
    assert note["is_read"] is False


def test_notifications_read_and_read_all(client, auth_headers):
    for i in range(3):
        client.post(
            "/api/licenses", json={"product": f"Widget {i}"}, headers=auth_headers
        )
    data = client.get("/api/notifications", headers=auth_headers).json()
    assert data["total"] == 3 and data["unread"] == 3

    first_id = data["notifications"][0]["id"]
    response = client.post(
        f"/api/notifications/{first_id}/read", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["is_read"] is True

    data = client.get("/api/notifications", headers=auth_headers).json()
    assert data["unread"] == 2
    # Unread notifications sort first.
    assert data["notifications"][0]["is_read"] is False

    response = client.post("/api/notifications/read-all", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["message"] == "2 notification(s) marked as read"
    data = client.get("/api/notifications", headers=auth_headers).json()
    assert data["unread"] == 0


def test_notifications_role_scoping(client, auth_headers):
    # A broadcast (admin) notification is visible to admins...
    client.post("/api/licenses", json={"product": "Widget"}, headers=auth_headers)
    # ...but not to a viewer (viewers only see their own rows).
    viewer_token = _login_as(
        client, auth_headers, "viewer@example.com", "viewerpass123", "viewer"
    )
    headers = {"Authorization": f"Bearer {viewer_token}"}
    data = client.get("/api/notifications", headers=headers).json()
    assert data["total"] == 0

    # A viewer cannot mark an admin notification as read either.
    admin_notes = client.get("/api/notifications", headers=auth_headers).json()
    note_id = admin_notes["notifications"][0]["id"]
    assert client.post(f"/api/notifications/{note_id}/read", headers=headers).status_code == 404


def test_user_create_creates_notification(client, auth_headers):
    client.post(
        "/api/users",
        json={"email": "new@example.com", "password": "newpass123", "role": "viewer"},
        headers=auth_headers,
    )
    data = client.get("/api/notifications", headers=auth_headers).json()
    assert data["total"] == 1
    assert "new@example.com" in data["notifications"][0]["message"]
