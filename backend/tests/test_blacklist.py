"""Blacklist tests (v2.2)."""


def _add(client, auth_headers, type_, value, reason=None):
    response = client.post(
        "/api/blacklist",
        json={"type": type_, "value": value, "reason": reason},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _make_license(client, auth_headers, key="LIC-TEST-0001"):
    response = client.post(
        "/api/licenses", json={"product": "Widget", "key": key}, headers=auth_headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_blacklist_crud_and_admin_only(client, auth_headers):
    entry = _add(client, auth_headers, "ip", "203.0.113.5", "abuse")
    assert entry["type"] == "ip" and entry["value"] == "203.0.113.5"

    response = client.get("/api/blacklist", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get("/api/blacklist?type=domain", headers=auth_headers)
    assert response.json() == []

    # Duplicate is rejected; bad values are rejected.
    assert client.post(
        "/api/blacklist", json={"type": "ip", "value": "203.0.113.5"}, headers=auth_headers
    ).status_code == 400
    assert client.post(
        "/api/blacklist", json={"type": "ip", "value": "not-an-ip"}, headers=auth_headers
    ).status_code == 400
    assert client.post(
        "/api/blacklist", json={"type": "domain", "value": "nodot"}, headers=auth_headers
    ).status_code == 400

    response = client.delete(f"/api/blacklist/{entry['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert client.get("/api/blacklist", headers=auth_headers).json() == []

    # Non-admin cannot manage the blacklist. (Register is admin-only after
    # bootstrap, so the viewer is created through the admin users endpoint.)
    client.post(
        "/api/users",
        json={"email": "viewer@example.com", "password": "viewerpass123", "role": "viewer"},
        headers=auth_headers,
    )
    viewer = client.post(
        "/api/auth/login",
        json={"email": "viewer@example.com", "password": "viewerpass123"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {viewer}"}
    assert client.get("/api/blacklist", headers=headers).status_code == 403
    assert client.post(
        "/api/blacklist", json={"type": "ip", "value": "10.0.0.1"}, headers=headers
    ).status_code == 403


def test_validate_blocked_ip_exact_and_cidr(client, auth_headers):
    lic = _make_license(client, auth_headers)
    _add(client, auth_headers, "ip", "203.0.113.0/24")
    body = {"key": lic["key"], "ip": "203.0.113.99"}
    response = client.post("/api/licenses/validate", json=body, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert response.json()["detail"] == "blocked: blacklisted"

    # An IP outside the CIDR validates normally.
    body = {"key": lic["key"], "ip": "198.51.100.7"}
    response = client.post("/api/licenses/validate", json=body, headers=auth_headers)
    assert response.json()["valid"] is True


def test_validate_blocked_domain_and_subdomain(client, auth_headers):
    lic = _make_license(client, auth_headers)
    _add(client, auth_headers, "domain", "bad.example.com")
    for domain in ("bad.example.com", "sub.bad.example.com"):
        response = client.post(
            "/api/licenses/validate",
            json={"key": lic["key"], "domain": domain},
            headers=auth_headers,
        )
        assert response.json()["valid"] is False
        assert response.json()["detail"] == "blocked: blacklisted"
    response = client.post(
        "/api/licenses/validate",
        json={"key": lic["key"], "domain": "good.example.com"},
        headers=auth_headers,
    )
    assert response.json()["valid"] is True


def test_check_access_blocked_domain(client, auth_headers):
    response = client.post(
        "/api/api-keys", json={"access_rights": ["get_license_info"]}, headers=auth_headers
    )
    key = response.json()["plain_key"]
    _add(client, auth_headers, "domain", "bad.example.com")
    # check-access with a blacklisted domain is rejected...
    response = client.get(
        "/api/api-keys/check-access?domain=bad.example.com", headers={"api-key": key}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "blocked: blacklisted"
    # ...while a clean domain passes.
    response = client.get(
        "/api/api-keys/check-access?domain=good.example.com", headers={"api-key": key}
    )
    assert response.status_code == 200
    assert response.json()["access_rights"] == ["get_license_info"]
