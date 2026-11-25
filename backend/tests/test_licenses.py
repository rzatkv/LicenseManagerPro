"""License tests: CRUD, filters, validate, renew, derived expiry."""


def _create_license(client, auth_headers, **overrides):
    body = {"product": "Test Product", "expires_in_days": 30}
    body.update(overrides)
    response = client.post("/api/licenses", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_license_generates_key(client, auth_headers):
    data = _create_license(client, auth_headers)
    assert data["key"]
    assert "-" in data["key"]
    assert data["status"] == "active"
    assert data["product"] == "Test Product"


def test_create_license_duplicate_key_rejected(client, auth_headers):
    _create_license(client, auth_headers, key="DUP-LIC-KEY-0001")
    response = client.post(
        "/api/licenses",
        json={"key": "DUP-LIC-KEY-0001", "product": "Other"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_list_licenses_and_status_filter(client, auth_headers):
    _create_license(client, auth_headers, key="ACTIVE-LIC-0001")
    _create_license(client, auth_headers, key="INACT-LIC-0001", status="inactive")
    response = client.get("/api/licenses", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2

    response = client.get("/api/licenses?filter=active", headers=auth_headers)
    assert [lic["key"] for lic in response.json()] == ["ACTIVE-LIC-0001"]

    response = client.get("/api/licenses?filter=inactive", headers=auth_headers)
    assert [lic["key"] for lic in response.json()] == ["INACT-LIC-0001"]


def test_list_licenses_time_filters(client, auth_headers):
    _create_license(client, auth_headers, key="TIME-LIC-00001")
    for filter_ in ("daily", "weekly", "monthly"):
        response = client.get(f"/api/licenses?filter={filter_}", headers=auth_headers)
        assert response.status_code == 200
        assert len(response.json()) == 1
    response = client.get("/api/licenses?filter=bogus", headers=auth_headers)
    assert response.status_code == 400


def test_list_licenses_search(client, auth_headers):
    _create_license(client, auth_headers, key="SEARCH-LIC-001", product="Widget Pro")
    _create_license(client, auth_headers, key="SEARCH-LIC-002", product="Gadget")
    response = client.get("/api/licenses?search=Widget", headers=auth_headers)
    assert [lic["key"] for lic in response.json()] == ["SEARCH-LIC-001"]


def test_get_update_delete_license(client, auth_headers):
    created = _create_license(client, auth_headers, key="CRUD-LIC-00001")
    lic_id = created["id"]

    response = client.get(f"/api/licenses/{lic_id}", headers=auth_headers)
    assert response.status_code == 200

    response = client.put(
        f"/api/licenses/{lic_id}",
        json={"product": "Renamed", "status": "inactive"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["product"] == "Renamed"
    assert response.json()["status"] == "inactive"

    response = client.delete(f"/api/licenses/{lic_id}", headers=auth_headers)
    assert response.status_code == 200
    assert client.get(f"/api/licenses/{lic_id}", headers=auth_headers).status_code == 404


def test_expired_status_is_derived_on_read(client, auth_headers):
    created = _create_license(
        client, auth_headers, key="EXPIRED-LIC-001", expires_in_days=-1
    )
    assert created["status"] == "expired"
    response = client.get("/api/licenses?filter=inactive", headers=auth_headers)
    assert [lic["key"] for lic in response.json()] == ["EXPIRED-LIC-001"]


def test_validate_license(client, auth_headers):
    created = _create_license(client, auth_headers, key="VALID-LIC-0001")
    response = client.post(
        "/api/licenses/validate", json={"key": created["key"]}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["valid"] is True

    response = client.post(
        "/api/licenses/validate", json={"key": "NOPE-0000"}, headers=auth_headers
    )
    assert response.json()["valid"] is False


def test_validate_expired_license(client, auth_headers):
    created = _create_license(
        client, auth_headers, key="VALEXP-LIC-0001", expires_in_days=-1
    )
    response = client.post(
        "/api/licenses/validate", json={"key": created["key"]}, headers=auth_headers
    )
    assert response.json()["valid"] is False
    assert "expired" in response.json()["detail"].lower()


def test_renew_license_extends_expiry(client, auth_headers):
    from datetime import datetime

    created = _create_license(client, auth_headers, key="RENEW-LIC-0001")
    old_expiry = datetime.fromisoformat(created["expires_at"])
    response = client.post(
        f"/api/licenses/{created['id']}/renew",
        json={"extend_days": 30},
        headers=auth_headers,
    )
    assert response.status_code == 200
    new_expiry = datetime.fromisoformat(response.json()["expires_at"])
    assert (new_expiry - old_expiry).days == 30
