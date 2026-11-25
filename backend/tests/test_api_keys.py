"""API key tests: CRUD, validation rules, daily limit, single-use, IP checks."""

KEY_BODY = {
    "access_rights": ["get_license_info"],
    "expires_in_days": 30,
}


def _create_key(client, auth_headers, **overrides):
    body = dict(KEY_BODY)
    body.update(overrides)
    response = client.post("/api/api-keys", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_key_generates_value_when_omitted(client, auth_headers):
    data = _create_key(client, auth_headers)
    assert data["key"].startswith("lmp_")
    assert data["access_rights"] == ["get_license_info"]
    assert data["single_use"] is False


def test_create_key_with_explicit_value(client, auth_headers):
    # v2.3: `key` is the 12-char display prefix; the full secret is
    # returned once as `plain_key` and never again.
    data = _create_key(client, auth_headers, key="my-explicit-key-123")
    assert data["key"] == "my-explicit-key-123"[:12]
    assert data["plain_key"] == "my-explicit-key-123"


def test_create_key_rejects_bad_access_right(client, auth_headers):
    response = client.post(
        "/api/api-keys",
        json={"access_rights": ["fly_to_the_moon"]},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_create_duplicate_key_rejected(client, auth_headers):
    _create_key(client, auth_headers, key="duplicate-key-12345")
    response = client.post(
        "/api/api-keys",
        json={"key": "duplicate-key-12345", "access_rights": ["get_license_info"]},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_list_keys_pagination_and_search(client, auth_headers):
    _create_key(client, auth_headers, key="searchable-key-aaaa")
    _create_key(client, auth_headers, key="other-key-bbbbb")
    response = client.get("/api/api-keys", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["api_keys"]) == 2

    response = client.get("/api/api-keys?search=searchable", headers=auth_headers)
    assert response.json()["total"] == 1

    response = client.get("/api/api-keys?limit=1", headers=auth_headers)
    assert len(response.json()["api_keys"]) == 1


def test_get_and_update_key(client, auth_headers):
    created = _create_key(client, auth_headers, key="updatable-key-123")
    response = client.get(f"/api/api-keys/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    # v2.3: get returns the prefix only, never the secret.
    assert response.json()["key"] == "updatable-key-123"[:12]
    assert response.json().get("plain_key") is None

    response = client.put(
        f"/api/api-keys/{created['id']}",
        json={"access_rights": ["create_license", "renew_license"]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["access_rights"] == ["create_license", "renew_license"]


def test_delete_key(client, auth_headers):
    created = _create_key(client, auth_headers, key="deletable-key-123")
    response = client.delete(f"/api/api-keys/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    response = client.get(f"/api/api-keys/{created['id']}", headers=auth_headers)
    assert response.status_code == 404


def test_check_access_valid_key(client, auth_headers):
    created = _create_key(client, auth_headers, key="valid-check-key-123")
    response = client.get(
        "/api/api-keys/check-access", headers={"api-key": created["plain_key"]}
    )
    assert response.status_code == 200
    assert response.json()["access_rights"] == ["get_license_info"]


def test_check_access_unknown_key_rejected(client):
    # v2.3: an unknown key is 401 (invalid credentials), not 403.
    response = client.get("/api/api-keys/check-access", headers={"api-key": "nope"})
    assert response.status_code == 401


def test_check_access_expired_key_rejected(client, auth_headers):
    created = _create_key(client, auth_headers, key="expired-key-123456", expires_in_days=-1)
    response = client.get(
        "/api/api-keys/check-access", headers={"api-key": created["plain_key"]}
    )
    # v2.3: an expired key is 401 (invalid credentials), not 403.
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


def test_check_access_single_use_consumed_on_first_use(client, auth_headers):
    created = _create_key(
        client, auth_headers, key="single-use-key-123", single_use=True
    )
    first = client.get("/api/api-keys/check-access", headers={"api-key": created["plain_key"]})
    assert first.status_code == 200
    second = client.get(
        "/api/api-keys/check-access", headers={"api-key": created["plain_key"]}
    )
    assert second.status_code == 403
    assert "already used" in second.json()["detail"]


def test_check_access_wrong_ip_rejected(client, auth_headers):
    created = _create_key(
        client, auth_headers, key="ip-locked-key-1234", associated_ip="203.0.113.99"
    )
    response = client.get(
        "/api/api-keys/check-access", headers={"api-key": created["plain_key"]}
    )
    assert response.status_code == 403


def test_check_access_wrong_domain_rejected(client, auth_headers):
    created = _create_key(
        client,
        auth_headers,
        key="domain-locked-key-12",
        associated_domain="example.com",
    )
    response = client.get(
        "/api/api-keys/check-access",
        params={"domain": "other.com"},
        headers={"api-key": created["plain_key"]},
    )
    assert response.status_code == 403
    ok = client.get(
        "/api/api-keys/check-access",
        params={"domain": "example.com"},
        headers={"api-key": created["plain_key"]},
    )
    assert ok.status_code == 200


def test_check_access_daily_limit(client, auth_headers):
    # Lower the limit to 2 via the settings endpoint, then the 3rd call fails.
    response = client.put(
        "/api/settings/daily_request_limit",
        json={"key": "daily_request_limit", "value": "2"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    created = _create_key(client, auth_headers, key="limited-key-12345")
    assert (
        client.get("/api/api-keys/check-access", headers={"api-key": created["plain_key"]}).status_code
        == 200
    )
    assert (
        client.get("/api/api-keys/check-access", headers={"api-key": created["plain_key"]}).status_code
        == 200
    )
    third = client.get("/api/api-keys/check-access", headers={"api-key": created["plain_key"]})
    assert third.status_code == 429
