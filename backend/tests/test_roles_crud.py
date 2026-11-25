"""Roles CRUD (v2.3): custom roles, built-in protection, assignment guard."""


def _create_role(client, auth_headers, name="Support Plus", permissions=None):
    return client.post(
        "/api/roles",
        json={"name": name, "permissions": permissions or ["licenses:create"]},
        headers=auth_headers,
    )


def test_list_roles_includes_builtins(client, auth_headers):
    response = client.get("/api/roles", headers=auth_headers)
    assert response.status_code == 200, response.text
    slugs = {r["slug"] for r in response.json()}
    assert {"admin", "manager", "support", "viewer"} <= slugs
    admin = next(r for r in response.json() if r["slug"] == "admin")
    assert admin["is_builtin"] is True
    assert admin["permissions"] == ["*"]


def test_list_permissions(client, auth_headers):
    response = client.get("/api/roles/permissions", headers=auth_headers)
    assert response.status_code == 200
    assert "products:write" in response.json()
    assert "roles:write" in response.json()


def test_create_custom_role(client, auth_headers):
    response = _create_role(client, auth_headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["slug"] == "support-plus"
    assert body["is_builtin"] is False
    assert body["permissions"] == ["licenses:create"]
    assert body["users_count"] == 0


def test_create_role_rejects_unknown_permission(client, auth_headers):
    response = _create_role(client, auth_headers, permissions=["nope:write"])
    assert response.status_code == 400


def test_create_role_rejects_builtin_slug(client, auth_headers):
    response = _create_role(client, auth_headers, name="Admin")
    assert response.status_code == 400


def test_update_custom_role(client, auth_headers):
    created = _create_role(client, auth_headers).json()
    response = client.put(
        f"/api/roles/{created['id']}",
        json={"name": "Support Plus 2", "permissions": ["licenses:create", "licenses:renew"]},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Support Plus 2"
    assert response.json()["permissions"] == ["licenses:create", "licenses:renew"]


def test_builtin_role_cannot_be_renamed_or_deleted(client, auth_headers):
    roles = client.get("/api/roles", headers=auth_headers).json()
    admin = next(r for r in roles if r["slug"] == "admin")
    assert (
        client.put(
            f"/api/roles/{admin['id']}", json={"name": "Boss"}, headers=auth_headers
        ).status_code
        == 400
    )
    assert client.delete(f"/api/roles/{admin['id']}", headers=auth_headers).status_code == 400


def test_cannot_delete_role_assigned_to_users(client, auth_headers):
    created = _create_role(client, auth_headers).json()
    user = client.post(
        "/api/users",
        json={"email": "roleuser@example.com", "password": "password123", "role_id": created["id"]},
        headers=auth_headers,
    )
    assert user.status_code == 201, user.text
    assert user.json()["role"] == "support-plus"
    assert user.json()["role_id"] == created["id"]
    assert client.delete(f"/api/roles/{created['id']}", headers=auth_headers).status_code == 400
    # Reassign the user to a built-in role, then deletion works.
    assert (
        client.put(
            f"/api/users/{user.json()['id']}",
            json={"role": "viewer"},
            headers=auth_headers,
        ).status_code
        == 200
    )
    assert client.delete(f"/api/roles/{created['id']}", headers=auth_headers).status_code == 200


def test_custom_role_permissions_gate_api(client, auth_headers):
    """A user whose custom role lacks a permission is denied (403)."""
    created = _create_role(client, auth_headers, permissions=["licenses:create"]).json()
    user = client.post(
        "/api/users",
        json={"email": "limited@example.com", "password": "password123", "role_id": created["id"]},
        headers=auth_headers,
    )
    assert user.status_code == 201
    login = client.post(
        "/api/auth/login",
        json={"email": "limited@example.com", "password": "password123"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    # licenses:create is allowed (permission held)...
    product = client.post(
        "/api/products",
        json={"name": "P", "billing_cycles": ["monthly"], "price": 1},
        headers=auth_headers,
    )
    assert product.status_code == 201
    lic = client.post(
        "/api/licenses",
        json={"product": "P", "key": "ROLE-TEST-0001"},
        headers=headers,
    )
    assert lic.status_code == 201, lic.text
    # ...but creating a user (users:write) is not.
    assert (
        client.post(
            "/api/users",
            json={"email": "x@example.com", "password": "password123"},
            headers=headers,
        ).status_code
        == 403
    )


def test_roles_require_admin(client, auth_headers):
    """A non-admin user cannot manage roles."""
    user = client.post(
        "/api/users",
        json={"email": "viewer@example.com", "password": "password123", "role": "viewer"},
        headers=auth_headers,
    )
    assert user.status_code == 201
    login = client.post(
        "/api/auth/login",
        json={"email": "viewer@example.com", "password": "password123"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/roles", headers=headers).status_code == 403
    assert client.post("/api/roles", json={"name": "Nope"}, headers=headers).status_code == 403
