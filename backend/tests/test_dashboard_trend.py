"""Dashboard license trend tests (v2.2; estimated MRR removed in
v2.3.4 — this is not a financial system)."""


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
