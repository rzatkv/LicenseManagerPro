"""Role & permission tests (v2.0)."""


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
    user = _make_user(client, auth_headers, email, role)
    return user, _login(client, email)


def test_support_cannot_delete_license(client, auth_headers):
    _, support_headers = _headers_for(client, auth_headers, "sup@example.com", "support")
    lic = client.post(
        "/api/licenses", json={"product": "Widget"}, headers=auth_headers
    ).json()
    response = client.delete(f"/api/licenses/{lic['id']}", headers=support_headers)
    assert response.status_code == 403

    # ...but support CAN create and renew licenses.
    response = client.post(
        "/api/licenses", json={"product": "Widget 2"}, headers=support_headers
    )
    assert response.status_code == 201
    response = client.post(
        f"/api/licenses/{response.json()['id']}/renew", json={}, headers=support_headers
    )
    assert response.status_code == 200


def test_viewer_cannot_create_product(client, auth_headers):
    _, viewer_headers = _headers_for(client, auth_headers, "view@example.com", "viewer")
    response = client.post(
        "/api/products",
        json={"name": "Nope", "billing_cycles": ["monthly"]},
        headers=viewer_headers,
    )
    assert response.status_code == 403

    # ...but viewer CAN read.
    assert client.get("/api/products", headers=viewer_headers).status_code == 200
    assert client.get("/api/licenses", headers=viewer_headers).status_code == 200


def test_manager_cannot_change_user_role(client, auth_headers):
    target, _ = _headers_for(client, auth_headers, "target@example.com", "viewer")
    _, manager_headers = _headers_for(client, auth_headers, "mgr@example.com", "manager")
    response = client.put(
        f"/api/users/{target['id']}", json={"role": "support"}, headers=manager_headers
    )
    assert response.status_code == 403

    # ...but a manager CAN create products and delete licenses.
    response = client.post(
        "/api/products",
        json={"name": "Mgr Product", "billing_cycles": ["monthly"]},
        headers=manager_headers,
    )
    assert response.status_code == 201
    lic = client.post(
        "/api/licenses", json={"product": "Widget"}, headers=auth_headers
    ).json()
    response = client.delete(f"/api/licenses/{lic['id']}", headers=manager_headers)
    assert response.status_code == 200

    # ...and a manager cannot delete settings.
    response = client.delete("/api/settings/daily_request_limit", headers=manager_headers)
    assert response.status_code == 403


def test_admin_can_do_everything(client, auth_headers):
    target, _ = _headers_for(client, auth_headers, "t2@example.com", "viewer")
    response = client.put(
        f"/api/users/{target['id']}", json={"role": "support"}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["role"] == "support"

    response = client.post(
        "/api/products",
        json={"name": "Admin Product", "billing_cycles": ["monthly"]},
        headers=auth_headers,
    )
    assert response.status_code == 201

    lic = client.post(
        "/api/licenses", json={"product": "Widget"}, headers=auth_headers
    ).json()
    response = client.delete(f"/api/licenses/{lic['id']}", headers=auth_headers)
    assert response.status_code == 200


def test_invalid_role_rejected(client, auth_headers):
    response = client.post(
        "/api/users",
        json={"email": "bad@example.com", "password": "userpass123", "role": "superuser"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    response = client.post(
        "/api/users",
        json={"email": "bad2@example.com", "password": "userpass123", "role": "user"},
        headers=auth_headers,
    )
    assert response.status_code == 400
