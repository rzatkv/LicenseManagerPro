"""License reissue + activation instances tests (v2.2)."""


def _create_product(client, auth_headers, **overrides):
    payload = {
        "name": "Panel",
        "billing_cycles": ["monthly", "annual"],
        "key_prefix": "PNL",
        "key_segments": 3,
        "key_segment_length": 4,
        "max_reissues": 1,
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_license(client, auth_headers, **overrides):
    payload = {"product": "Widget"}
    payload.update(overrides)
    response = client.post("/api/licenses", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_product_key_format(client, auth_headers):
    product = _create_product(client, auth_headers)
    lic = _create_license(
        client, auth_headers, product_id=product["id"], billing_cycle="monthly"
    )
    # Prefix + 3 segments of 4 chars.
    parts = lic["key"].split("-")
    assert parts[0] == "PNL"
    assert len(parts) == 4
    assert all(len(p) == 4 for p in parts[1:])


def test_reissue_replaces_key_and_counts(client, auth_headers):
    product = _create_product(client, auth_headers)
    lic = _create_license(
        client, auth_headers, product_id=product["id"], billing_cycle="monthly"
    )
    old_key = lic["key"]
    assert lic["reissue_count"] == 0

    response = client.post(f"/api/licenses/{lic['id']}/reissue", headers=auth_headers)
    assert response.status_code == 200, response.text
    new = response.json()
    assert new["key"] != old_key
    assert new["key"].startswith("PNL-")
    assert new["reissue_count"] == 1

    # The old key no longer validates.
    response = client.post(
        "/api/licenses/validate", json={"key": old_key}, headers=auth_headers
    )
    assert response.json()["valid"] is False
    response = client.post(
        "/api/licenses/validate", json={"key": new["key"]}, headers=auth_headers
    )
    assert response.json()["valid"] is True

    # max_reissues=1: a second reissue is refused.
    response = client.post(f"/api/licenses/{lic['id']}/reissue", headers=auth_headers)
    assert response.status_code == 400


def test_activation_instances(client, auth_headers):
    lic = _create_license(client, auth_headers, max_activations=2)

    response = client.get(f"/api/licenses/{lic['id']}/activations", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []

    def activate(fp):
        return client.post(
            f"/api/licenses/{lic['id']}/activations",
            json={"fingerprint": fp, "label": fp},
            headers=auth_headers,
        )

    r1 = activate("machine-a")
    assert r1.status_code == 201, r1.text
    assert r1.json()["fingerprint"] == "machine-a"

    # Same fingerprint again: same record, no extra slot used.
    r1b = activate("machine-a")
    assert r1b.status_code == 201
    assert r1b.json()["id"] == r1.json()["id"]
    lic_now = client.get(f"/api/licenses/{lic['id']}", headers=auth_headers).json()
    assert lic_now["activations"] == 1

    r2 = activate("machine-b")
    assert r2.status_code == 201
    lic_now = client.get(f"/api/licenses/{lic['id']}", headers=auth_headers).json()
    assert lic_now["activations"] == 2

    # Limit reached.
    assert activate("machine-c").status_code == 400

    # Deactivate one instance: frees a slot.
    response = client.delete(
        f"/api/licenses/{lic['id']}/activations/{r2.json()['id']}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    lic_now = client.get(f"/api/licenses/{lic['id']}", headers=auth_headers).json()
    assert lic_now["activations"] == 1
    assert activate("machine-c").status_code == 201

    # Unknown activation id.
    assert client.delete(
        f"/api/licenses/{lic['id']}/activations/9999", headers=auth_headers
    ).status_code == 404
