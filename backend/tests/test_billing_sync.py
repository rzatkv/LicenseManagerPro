"""Billing-cycle sync (v2.3): a module may create/renew/update a license
with a valid cycle the product does not list yet — the backend adds the
cycle to the product automatically. Unknown cycles are rejected (422)."""

from datetime import UTC, datetime

from services.licenses import add_months


def _create_product(client, auth_headers, cycles=None):
    response = client.post(
        "/api/products",
        json={"name": "SyncProd", "billing_cycles": cycles or ["monthly"], "price": 10},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _get_product(client, auth_headers, product_id):
    response = client.get(f"/api/products/{product_id}", headers=auth_headers)
    assert response.status_code == 200, response.text
    return response.json()


def _create_license(client, auth_headers, product_id, cycle, **overrides):
    body = {"product_id": product_id, "billing_cycle": cycle}
    body.update(overrides)
    return client.post("/api/licenses", json=body, headers=auth_headers)


def _now():
    return datetime.now(UTC).replace(tzinfo=None)


def test_create_with_cycle_not_on_product_syncs_it(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    response = _create_license(client, auth_headers, product["id"], "annual")
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["billing_cycle"] == "annual"
    # Expiry follows the cycle sent (12 calendar months from creation).
    actual = datetime.fromisoformat(created["expires_at"])
    assert actual.date() == add_months(_now(), 12).date()
    # The product gained the cycle (order preserved, nothing dropped).
    updated = _get_product(client, auth_headers, product["id"])
    assert updated["billing_cycles"] == ["monthly", "annual"]


def test_create_with_unknown_cycle_rejected_422(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    response = _create_license(client, auth_headers, product["id"], "triennial")
    assert response.status_code == 422, response.text
    assert "Invalid billing_cycle" in response.json()["detail"]
    assert "triennial" in response.json()["detail"]
    # The failed create did not touch the product.
    assert _get_product(client, auth_headers, product["id"])["billing_cycles"] == ["monthly"]


def test_create_with_existing_cycle_leaves_product_unchanged(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly", "annual"])
    response = _create_license(client, auth_headers, product["id"], "annual")
    assert response.status_code == 201, response.text
    assert _get_product(client, auth_headers, product["id"])["billing_cycles"] == [
        "monthly",
        "annual",
    ]


def test_renew_with_new_cycle_syncs_it(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    created = _create_license(client, auth_headers, product["id"], "monthly")
    assert created.status_code == 201, created.text
    created = created.json()
    old_expiry = datetime.fromisoformat(created["expires_at"])
    response = client.post(
        f"/api/licenses/{created['id']}/renew?billing_cycle=annual",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    renewed = response.json()
    assert renewed["billing_cycle"] == "annual"
    # Expiry extended by the NEW cycle from the previous expiry.
    new_expiry = datetime.fromisoformat(renewed["expires_at"])
    assert new_expiry.date() == add_months(old_expiry, 12).date()
    assert _get_product(client, auth_headers, product["id"])["billing_cycles"] == [
        "monthly",
        "annual",
    ]


def test_renew_with_unknown_cycle_rejected_422(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    created = _create_license(client, auth_headers, product["id"], "monthly")
    assert created.status_code == 201, created.text
    created = created.json()
    response = client.post(
        f"/api/licenses/{created['id']}/renew?billing_cycle=triennial",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 422, response.text
    assert "Invalid billing_cycle" in response.json()["detail"]
    assert _get_product(client, auth_headers, product["id"])["billing_cycles"] == ["monthly"]


def test_update_license_cycle_syncs_it(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    created = _create_license(client, auth_headers, product["id"], "monthly")
    assert created.status_code == 201, created.text
    created = created.json()
    response = client.put(
        f"/api/licenses/{created['id']}",
        json={"billing_cycle": "quarterly"},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["billing_cycle"] == "quarterly"
    assert _get_product(client, auth_headers, product["id"])["billing_cycles"] == [
        "monthly",
        "quarterly",
    ]


def test_update_license_unknown_cycle_rejected_422(client, auth_headers):
    product = _create_product(client, auth_headers, cycles=["monthly"])
    created = _create_license(client, auth_headers, product["id"], "monthly")
    assert created.status_code == 201, created.text
    created = created.json()
    response = client.put(
        f"/api/licenses/{created['id']}",
        json={"billing_cycle": "triennial"},
        headers=auth_headers,
    )
    assert response.status_code == 422, response.text
    assert "Invalid billing_cycle" in response.json()["detail"]
