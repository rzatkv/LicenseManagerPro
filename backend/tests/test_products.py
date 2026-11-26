"""Product tests: CRUD, cycle validation, delete guard, webhook fields."""


def _create_product(client, auth_headers, **overrides):
    body = {
        "name": "Widget Pro",
        "billing_cycles": ["monthly", "annual"],
    }
    body.update(overrides)
    response = client.post("/api/products", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_get_product(client, auth_headers):
    created = _create_product(client, auth_headers)
    assert created["slug"] == "widget-pro"
    assert created["billing_cycles"] == ["monthly", "annual"]
    assert created["status"] == "active"

    response = client.get(f"/api/products/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Widget Pro"


def test_list_products(client, auth_headers):
    _create_product(client, auth_headers, name="Alpha")
    _create_product(client, auth_headers, name="Beta")
    response = client.get("/api/products", headers=auth_headers)
    assert response.status_code == 200
    assert [p["name"] for p in response.json()] == ["Alpha", "Beta"]


def test_create_product_invalid_cycle_rejected(client, auth_headers):
    response = client.post(
        "/api/products",
        json={"name": "Bad", "billing_cycles": ["weekly"]},
        headers=auth_headers,
    )
    assert response.status_code == 400

    response = client.post(
        "/api/products",
        json={"name": "Bad", "billing_cycles": []},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_create_product_duplicate_slug_rejected(client, auth_headers):
    _create_product(client, auth_headers, name="Dup", slug="dup-slug")
    response = client.post(
        "/api/products",
        json={"name": "Dup 2", "slug": "dup-slug", "billing_cycles": ["monthly"]},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_update_product(client, auth_headers):
    created = _create_product(client, auth_headers)
    response = client.put(
        f"/api/products/{created['id']}",
        json={"description": "Updated widget", "billing_cycles": ["monthly", "annual", "lifetime"]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["description"] == "Updated widget"
    assert response.json()["billing_cycles"] == ["monthly", "annual", "lifetime"]


def test_webhook_fields_saved(client, auth_headers):
    created = _create_product(
        client,
        auth_headers,
        webhook_url="https://example.com/hook",
        webhook_events=["license.created", "license.renewed"],
        webhook_secret="s3cret",
    )
    assert created["webhook_url"] == "https://example.com/hook"
    assert created["webhook_events"] == ["license.created", "license.renewed"]
    assert created["webhook_secret"] == "s3cret"


def test_delete_product_blocked_when_licenses_exist(client, auth_headers):
    product = _create_product(client, auth_headers)
    response = client.post(
        "/api/licenses",
        json={"product_id": product["id"], "billing_cycle": "monthly"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text

    response = client.delete(f"/api/products/{product['id']}", headers=auth_headers)
    assert response.status_code == 400

    # A product with no licenses deletes fine.
    other = _create_product(client, auth_headers, name="Lonely")
    response = client.delete(f"/api/products/{other['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert client.get(f"/api/products/{other['id']}", headers=auth_headers).status_code == 404


def test_products_require_token(client):
    assert client.get("/api/products").status_code == 401
    assert client.post(
        "/api/products", json={"name": "X", "billing_cycles": ["monthly"]}
    ).status_code == 401
