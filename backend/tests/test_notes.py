"""Product & license notes toggle (v3.0): gating is real, both ways."""


def _product_payload(notes="Internal note"):
    return {"name": "Widget", "billing_cycles": ["monthly"], "notes": notes}


def test_notes_saved_when_enabled(client, auth_headers):
    resp = client.post("/api/products", json=_product_payload(), headers=auth_headers)
    assert resp.status_code == 201, resp.text
    assert resp.json()["notes"] == "Internal note"
    pid = resp.json()["id"]
    # License notes too.
    resp = client.post(
        "/api/licenses",
        json={"product_id": pid, "billing_cycle": "monthly", "notes": "VIP customer"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["notes"] == "VIP customer"
    # Update works as well.
    resp = client.put(
        f"/api/products/{pid}", json={"notes": "Updated note"}, headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["notes"] == "Updated note"


def test_notes_rejected_when_disabled(client, auth_headers):
    resp = client.put(
        "/api/settings/product_notes_enabled",
        json={"key": "product_notes_enabled", "value": "off"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    resp = client.post("/api/products", json=_product_payload(), headers=auth_headers)
    assert resp.status_code == 400
    assert "notes" in resp.text.lower()
    # License create with notes is rejected too.
    resp = client.post(
        "/api/products",
        json={"name": "Plain", "billing_cycles": ["monthly"]},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    pid = resp.json()["id"]
    resp = client.post(
        "/api/licenses",
        json={"product_id": pid, "billing_cycle": "monthly", "notes": "Nope"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    # And updating an existing product's notes is rejected.
    resp = client.put(
        f"/api/products/{pid}", json={"notes": "Nope"}, headers=auth_headers
    )
    assert resp.status_code == 400


def test_notes_toggle_validation(client, auth_headers):
    resp = client.put(
        "/api/settings/product_notes_enabled",
        json={"key": "product_notes_enabled", "value": "yes"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
