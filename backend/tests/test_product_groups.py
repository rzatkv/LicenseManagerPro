"""Product groups tests (v2.2)."""


def _create_group(client, auth_headers, **overrides):
    payload = {"name": "Hosting", "color": "#FF0000", "sort_order": 1}
    payload.update(overrides)
    response = client.post("/api/product-groups", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_product(client, auth_headers, **overrides):
    payload = {"name": "Panel", "billing_cycles": ["monthly"]}
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_group_crud(client, auth_headers):
    group = _create_group(client, auth_headers)
    assert group["slug"] == "hosting"
    assert group["color"] == "#FF0000"

    response = client.get("/api/product-groups", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.put(
        f"/api/product-groups/{group['id']}",
        json={"name": "Hosting & Domains", "color": "#00FF00"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Hosting & Domains"
    assert response.json()["slug"] == "hosting"  # slug unchanged unless sent

    response = client.delete(f"/api/product-groups/{group['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert client.get("/api/product-groups", headers=auth_headers).json() == []


def test_group_slug_duplicate_and_bad_color(client, auth_headers):
    _create_group(client, auth_headers, name="Hosting")
    response = client.post(
        "/api/product-groups", json={"name": "Hosting"}, headers=auth_headers
    )
    assert response.status_code == 400
    response = client.post(
        "/api/product-groups",
        json={"name": "Other", "color": "red"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_group_delete_blocked_by_products(client, auth_headers):
    group = _create_group(client, auth_headers)
    _create_product(client, auth_headers, group_id=group["id"])
    response = client.delete(f"/api/product-groups/{group['id']}", headers=auth_headers)
    assert response.status_code == 400
    assert "product" in response.json()["detail"]


def test_product_group_filter_and_assignment(client, auth_headers):
    g1 = _create_group(client, auth_headers, name="Hosting")
    g2 = _create_group(client, auth_headers, name="Tools")
    _create_product(client, auth_headers, name="Panel A", group_id=g1["id"])
    _create_product(client, auth_headers, name="Panel B", group_id=g2["id"])
    _create_product(client, auth_headers, name="Panel C")

    response = client.get(f"/api/products?group_id={g1['id']}", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1 and items[0]["name"] == "Panel A"
    assert items[0]["group_id"] == g1["id"]

    # Unknown group id on create is rejected.
    response = client.post(
        "/api/products",
        json={"name": "Bad", "billing_cycles": ["monthly"], "group_id": 9999},
        headers=auth_headers,
    )
    assert response.status_code == 400
