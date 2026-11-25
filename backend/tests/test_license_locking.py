"""License locking + product billing-cycle tests (v2.0)."""
from datetime import datetime, timezone

from services.licenses import add_months


def _create_product(client, auth_headers, cycles=None):
    body = {
        "name": "Widget Pro",
        "billing_cycles": cycles or ["monthly", "quarterly", "annual", "lifetime"],
    }
    response = client.post("/api/products", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_license_from_product(client, auth_headers, product_id, cycle, **overrides):
    body = {"product_id": product_id, "billing_cycle": cycle}
    body.update(overrides)
    response = client.post("/api/licenses", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_annual_license_expiry_is_12_calendar_months(client, auth_headers):
    product = _create_product(client, auth_headers)
    created = _create_license_from_product(client, auth_headers, product["id"], "annual")
    assert created["product"] == "Widget Pro"
    assert created["product_id"] == product["id"]
    assert created["billing_cycle"] == "annual"

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expected = add_months(now, 12)
    actual = datetime.fromisoformat(created["expires_at"])
    # Same calendar date a year later (allow a few seconds of clock skew).
    assert actual.date() == expected.date()


def test_lifetime_license_has_no_expiry(client, auth_headers):
    product = _create_product(client, auth_headers)
    created = _create_license_from_product(client, auth_headers, product["id"], "lifetime")
    assert created["expires_at"] is None
    assert created["status"] == "active"


def test_create_license_requires_cycle_for_product(client, auth_headers):
    product = _create_product(client, auth_headers)
    response = client.post(
        "/api/licenses", json={"product_id": product["id"]}, headers=auth_headers
    )
    assert response.status_code == 400

    response = client.post(
        "/api/licenses",
        json={"product_id": product["id"], "billing_cycle": "biennial"},
        headers=auth_headers,
    )
    assert response.status_code == 400  # biennial not offered by this product


def test_validate_lock_domain(client, auth_headers):
    product = _create_product(client, auth_headers)
    lic = _create_license_from_product(
        client,
        auth_headers,
        product["id"],
        "monthly",
        key="LOCK-DOM-00001",
        allowed_domains=["example.com"],
    )
    # Wrong domain rejected.
    response = client.post(
        "/api/licenses/validate",
        json={"key": lic["key"], "domain": "evil.com"},
        headers=auth_headers,
    )
    assert response.json()["valid"] is False
    assert response.json()["detail"] == "domain not allowed"

    # No domain at all is also rejected when a lock is set.
    response = client.post(
        "/api/licenses/validate", json={"key": lic["key"]}, headers=auth_headers
    )
    assert response.json()["valid"] is False

    # Exact match and subdomain match pass.
    for domain in ("example.com", "app.example.com", "EXAMPLE.COM"):
        response = client.post(
            "/api/licenses/validate",
            json={"key": lic["key"], "domain": domain},
            headers=auth_headers,
        )
        assert response.json()["valid"] is True, domain


def test_validate_lock_ip_and_install_path(client, auth_headers):
    product = _create_product(client, auth_headers)
    lic = _create_license_from_product(
        client,
        auth_headers,
        product["id"],
        "monthly",
        key="LOCK-IP-000001",
        allowed_domains=["example.com"],
        allowed_ips=["1.2.3.4"],
        install_path="/opt/app",
    )
    good = {"key": lic["key"], "domain": "example.com", "ip": "1.2.3.4", "install_path": "/opt/app"}
    response = client.post("/api/licenses/validate", json=good, headers=auth_headers)
    assert response.json()["valid"] is True

    bad_ip = dict(good, ip="9.9.9.9")
    response = client.post("/api/licenses/validate", json=bad_ip, headers=auth_headers)
    assert response.json()["valid"] is False
    assert response.json()["detail"] == "ip not allowed"

    bad_path = dict(good, install_path="/other/app")
    response = client.post("/api/licenses/validate", json=bad_path, headers=auth_headers)
    assert response.json()["valid"] is False
    assert response.json()["detail"] == "install path not allowed"


def test_renew_monthly_extends_one_calendar_month(client, auth_headers):
    product = _create_product(client, auth_headers)
    created = _create_license_from_product(client, auth_headers, product["id"], "monthly")
    old_expiry = datetime.fromisoformat(created["expires_at"])
    response = client.post(
        f"/api/licenses/{created['id']}/renew", json={}, headers=auth_headers
    )
    assert response.status_code == 200, response.text
    new_expiry = datetime.fromisoformat(response.json()["expires_at"])
    assert new_expiry.date() == add_months(old_expiry, 1).date()


def test_renew_with_extend_days_overrides_cycle(client, auth_headers):
    product = _create_product(client, auth_headers)
    created = _create_license_from_product(client, auth_headers, product["id"], "monthly")
    old_expiry = datetime.fromisoformat(created["expires_at"])
    response = client.post(
        f"/api/licenses/{created['id']}/renew",
        json={"extend_days": 10},
        headers=auth_headers,
    )
    assert response.status_code == 200
    new_expiry = datetime.fromisoformat(response.json()["expires_at"])
    assert (new_expiry - old_expiry).days == 10


def test_renew_lifetime_rejected(client, auth_headers):
    product = _create_product(client, auth_headers)
    created = _create_license_from_product(client, auth_headers, product["id"], "lifetime")
    response = client.post(
        f"/api/licenses/{created['id']}/renew", json={}, headers=auth_headers
    )
    assert response.status_code == 400
    assert "lifetime" in response.json()["detail"].lower()


def test_lock_fields_accept_comma_separated_string(client, auth_headers):
    """The frontend sends lock fields as comma-separated strings; the API
    must accept them (and still return lists on read)."""
    response = client.post(
        "/api/licenses",
        json={
            "product": "Widget",
            "allowed_domains": "example.com, shop.example.com",
            "allowed_ips": "1.2.3.4",
            "install_path": "/var/www/app",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["allowed_domains"] == ["example.com", "shop.example.com"]
    assert created["allowed_ips"] == ["1.2.3.4"]

    # The locks are enforced with the string form stored.
    bad = client.post(
        "/api/licenses/validate",
        json={"key": created["key"], "domain": "evil.com"},
        headers=auth_headers,
    )
    assert bad.status_code == 200
    assert bad.json()["valid"] is False
    good = client.post(
        "/api/licenses/validate",
        json={"key": created["key"], "domain": "shop.example.com", "ip": "1.2.3.4", "install_path": "/var/www/app"},
        headers=auth_headers,
    )
    assert good.status_code == 200
    assert good.json()["valid"] is True
