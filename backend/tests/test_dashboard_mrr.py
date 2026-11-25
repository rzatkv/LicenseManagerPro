"""Dashboard estimated MRR + license trend tests (v2.2)."""


def _create_product(client, auth_headers, name, price, cycles):
    response = client.post(
        "/api/products",
        json={"name": name, "price": price, "billing_cycles": cycles},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_estimated_mrr(client, auth_headers):
    monthly = _create_product(client, auth_headers, "Monthly Tool", 12, ["monthly"])
    annual = _create_product(client, auth_headers, "Annual Tool", 120, ["annual"])
    lifetime = _create_product(client, auth_headers, "Lifetime Tool", 500, ["lifetime"])

    def lic(product_id, cycle, status="active"):
        payload = {"product_id": product_id, "billing_cycle": cycle}
        if status != "active":
            payload["status"] = status
        response = client.post("/api/licenses", json=payload, headers=auth_headers)
        assert response.status_code == 201, response.text
        return response.json()

    lic(monthly["id"], "monthly")          # 12 / 1 = 12
    lic(annual["id"], "annual")            # 120 / 12 = 10
    lic(lifetime["id"], "lifetime")        # lifetime contributes 0
    lic(monthly["id"], "monthly", status="inactive")  # inactive contributes 0

    data = client.get("/api/dashboard/summary", headers=auth_headers).json()
    assert data["activeLicenses"] == 3
    assert data["inactiveLicenses"] == 1
    assert data["estimated_mrr"] == 22.0


def test_license_trend(client, auth_headers):
    client.post("/api/licenses", json={"product": "A"}, headers=auth_headers)
    client.post("/api/licenses", json={"product": "B"}, headers=auth_headers)
    response = client.get("/api/dashboard/license-trend?days=14", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["days"] == 14
    assert len(data["points"]) == 14
    assert sum(p["count"] for p in data["points"]) == 2
    # The last point is today (both licenses were created today).
    assert data["points"][-1]["count"] == 2
