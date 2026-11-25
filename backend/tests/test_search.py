"""Global search (v2.3): GET /api/search?q=..."""

import pytest


@pytest.fixture()
def seeded(client, auth_headers):
    product = client.post(
        "/api/products",
        json={"name": "SearchWidget", "billing_cycles": ["monthly"], "price": 5},
        headers=auth_headers,
    ).json()
    lic = client.post(
        "/api/licenses",
        json={
            "product": "SearchWidget",
            "key": "SRCH-KEY-0001",
            "owner_email": "buyer@example.com",
        },
        headers=auth_headers,
    ).json()
    user = client.post(
        "/api/users",
        json={"email": "searchuser@example.com", "password": "password123", "role": "viewer"},
        headers=auth_headers,
    ).json()
    return {"product": product, "license": lic, "user": user}


def test_search_finds_license_by_key(client, auth_headers, seeded):
    response = client.get("/api/search?q=SRCH-KEY", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert len(response.json()["licenses"]) == 1
    assert response.json()["licenses"][0]["title"] == "SRCH-KEY-0001"
    assert response.json()["licenses"][0]["link"] == "/licenses"


def test_search_finds_product_and_user(client, auth_headers, seeded):
    response = client.get("/api/search?q=Search", headers=auth_headers)
    body = response.json()
    assert any(p["title"] == "SearchWidget" for p in body["products"])
    assert any(u["title"] == "searchuser@example.com" for u in body["users"])
    # ...but the license's product name contains "Search", so it matches too.
    assert any(lic["title"] == "SRCH-KEY-0001" for lic in body["licenses"])


def test_search_by_customer_email(client, auth_headers, seeded):
    response = client.get("/api/search?q=buyer@example", headers=auth_headers)
    assert len(response.json()["licenses"]) == 1


def test_search_empty_query_returns_empty(client, auth_headers, seeded):
    response = client.get("/api/search?q=", headers=auth_headers)
    assert response.json() == {"licenses": [], "products": [], "users": []}


def test_search_requires_auth(client):
    assert client.get("/api/search?q=x").status_code == 401


def test_search_hides_users_from_support(client, auth_headers, seeded):
    """Support users may search licenses/products but not users."""
    client.post(
        "/api/users",
        json={"email": "support@example.com", "password": "password123", "role": "support"},
        headers=auth_headers,
    ).json()
    login = client.post(
        "/api/auth/login",
        json={"email": "support@example.com", "password": "password123"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    response = client.get("/api/search?q=searchuser", headers=headers)
    assert response.json()["users"] == []
    assert any(
        p["title"] == "SearchWidget"
        for p in client.get("/api/search?q=Search", headers=headers).json()["products"]
    )
