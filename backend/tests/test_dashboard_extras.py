"""Dashboard extras (v2.3): activations trend + webhook delivery stats."""


def test_activations_trend_shape(client, auth_headers):
    response = client.get("/api/dashboard/activations-trend?days=7", headers=auth_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["days"] == 7
    assert len(body["points"]) == 7
    assert all(p["count"] == 0 for p in body["points"])


def test_activations_trend_counts_activation(client, auth_headers):
    product = client.post(
        "/api/products",
        json={"name": "TrendProd", "billing_cycles": ["monthly"]},
        headers=auth_headers,
    ).json()
    lic = client.post(
        "/api/licenses",
        json={
            "product": "TrendProd",
            "key": "TREND-0001",
            "product_id": product["id"],
            "billing_cycle": "monthly",
        },
        headers=auth_headers,
    ).json()
    assert (
        client.post(
            f"/api/licenses/{lic['id']}/activations",
            json={"fingerprint": "m1"},
            headers=auth_headers,
        ).status_code
        == 201
    )
    response = client.get("/api/dashboard/activations-trend?days=7", headers=auth_headers)
    today = response.json()["points"][-1]
    assert today["count"] == 1


def test_webhook_stats_empty(client, auth_headers):
    response = client.get("/api/dashboard/webhook-stats", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {
        "total": 0,
        "success": 0,
        "failed": 0,
        "success_rate": 100.0,
        "by_event": {},
    }


def test_webhook_stats_counts_deliveries(client, auth_headers, monkeypatch):
    """Force one successful + one failed delivery via the webhook service."""
    from database import SessionLocal
    from models import Product
    from services import webhooks as webhook_service

    product = client.post(
        "/api/products",
        json={
            "name": "HookProd",
            "billing_cycles": ["monthly"],
            "webhook_url": "https://8.8.8.8/hook",
            "webhook_events": ["license.created"],
        },
        headers=auth_headers,
    ).json()
    lic = client.post(
        "/api/licenses",
        json={
            "product": "HookProd",
            "key": "HOOK-0001",
            "product_id": product["id"],
            "billing_cycle": "monthly",
        },
        headers=auth_headers,
    ).json()

    db = SessionLocal()
    try:
        product_row = db.query(Product).filter(Product.id == product["id"]).first()
        # A delivery to an unroutable host fails (recorded, success=False).
        # License creation above already dispatched one "created" event.
        webhook_service.dispatch_webhook(db, product_row, "renewed", {"license_key": lic["key"]})
    finally:
        db.close()

    response = client.get("/api/dashboard/webhook-stats", headers=auth_headers)
    body = response.json()
    assert body["total"] == 2
    assert body["failed"] == 2
    assert body["success_rate"] == 0.0
    assert body["by_event"]["license.created"]["total"] == 1
    assert body["by_event"]["renewed"]["total"] == 1


def _login_as(client, auth_headers, email, role):
    created = client.post(
        "/api/users",
        json={"email": email, "password": "testpass123", "role": role},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    login = client.post(
        "/api/auth/login", json={"email": email, "password": "testpass123"}
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_dashboard_readable_by_manager_support_viewer(client, auth_headers):
    """v3.0.6 (security, L14): dashboard:read existed in ALL_PERMISSIONS
    but in NO role's set, so every non-admin got 403 on /api/dashboard/*
    — the panel's home page was admin-only. The dashboard is read-only
    data; manager, support and viewer can all read it now."""
    for email, role in (
        ("manager-dash@example.com", "manager"),
        ("support-dash@example.com", "support"),
        ("viewer-dash@example.com", "viewer"),
    ):
        headers = _login_as(client, auth_headers, email, role)
        resp = client.get("/api/dashboard/summary", headers=headers)
        assert resp.status_code == 200, f"{role}: {resp.text}"
