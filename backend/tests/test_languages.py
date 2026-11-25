"""Custom-language tests (v2.0)."""


def test_language_crud(client, auth_headers):
    # Create via PUT (create-or-update).
    response = client.put(
        "/api/languages/de",
        json={"name": "Deutsch", "translations": {"hello": "Hallo", "bye": "Tschüss"}},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["code"] == "de"
    assert response.json()["name"] == "Deutsch"
    assert response.json()["translations"]["hello"] == "Hallo"

    # List shows code+name only.
    response = client.get("/api/languages", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()
    assert rows == [{"code": "de", "name": "Deutsch"}]

    # Full get returns translations.
    response = client.get("/api/languages/de", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["translations"]["bye"] == "Tschüss"

    # Update replaces name and translations.
    response = client.put(
        "/api/languages/de",
        json={"name": "Deutsch (DE)", "translations": {"hello": "Hallo! neu"}},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Deutsch (DE)"
    assert response.json()["translations"] == {"hello": "Hallo! neu"}

    # Delete.
    response = client.delete("/api/languages/de", headers=auth_headers)
    assert response.status_code == 200
    assert client.get("/api/languages/de", headers=auth_headers).status_code == 404
    assert client.get("/api/languages", headers=auth_headers).json() == []


def test_language_not_found(client, auth_headers):
    assert client.get("/api/languages/zz", headers=auth_headers).status_code == 404
    assert client.delete("/api/languages/zz", headers=auth_headers).status_code == 404


def test_languages_require_token(client, auth_headers):
    assert client.get("/api/languages").status_code == 401
    assert client.get("/api/languages/de").status_code == 401
    assert client.put(
        "/api/languages/de", json={"name": "Deutsch", "translations": {}}
    ).status_code == 401
    assert client.delete("/api/languages/de").status_code == 401


def _login(client, email, password="userpass123"):
    response = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_language_writes_require_permission(client, auth_headers):
    # Viewer may read but not write languages.
    response = client.post(
        "/api/users",
        json={"email": "langview@example.com", "password": "userpass123", "role": "viewer"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    viewer_headers = _login(client, "langview@example.com")
    assert client.get("/api/languages", headers=viewer_headers).status_code == 200
    assert client.put(
        "/api/languages/de",
        json={"name": "Deutsch", "translations": {"hello": "Hallo"}},
        headers=viewer_headers,
    ).status_code == 403
    assert client.delete("/api/languages/de", headers=viewer_headers).status_code == 403

    # Manager may write languages.
    response = client.post(
        "/api/users",
        json={"email": "langmgr@example.com", "password": "userpass123", "role": "manager"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    manager_headers = _login(client, "langmgr@example.com")
    response = client.put(
        "/api/languages/de",
        json={"name": "Deutsch", "translations": {"hello": "Hallo"}},
        headers=manager_headers,
    )
    assert response.status_code == 200, response.text
    response = client.delete("/api/languages/de", headers=manager_headers)
    assert response.status_code == 200, response.text
