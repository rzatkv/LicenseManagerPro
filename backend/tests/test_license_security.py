"""License security modes (v2.3): strict vs lenient, lock toggles,
missing-lock behavior, and per-product overrides."""

LICENSE = {
    "product": "SecProd",
    "key": "SEC-LOCK-0001",
    "allowed_domains": "example.com",
    "billing_cycle": "monthly",
}


def _make_locked_license(client, auth_headers):
    product = client.post(
        "/api/products",
        json={"name": "SecProd", "billing_cycles": ["monthly"], "price": 10},
        headers=auth_headers,
    )
    assert product.status_code == 201, product.text
    lic = client.post(
        "/api/licenses",
        json={**LICENSE, "product_id": product.json()["id"]},
        headers=auth_headers,
    )
    assert lic.status_code == 201, lic.text
    return product.json(), lic.json()


def _validate(client, auth_headers, key, **kw):
    body = {"key": key}
    body.update(kw)
    return client.post("/api/licenses/validate", json=body, headers=auth_headers)


def test_strict_default_denies_domain_mismatch(client, auth_headers):
    _product, lic = _make_locked_license(client, auth_headers)
    ok = _validate(client, auth_headers, lic["key"], domain="example.com")
    assert ok.status_code == 200 and ok.json()["valid"] is True
    bad = _validate(client, auth_headers, lic["key"], domain="evil.com")
    assert bad.json()["valid"] is False
    assert bad.json()["detail"] == "domain not allowed"
    assert bad.json()["grace"] is False
    # Missing domain also denies by default.
    missing = _validate(client, auth_headers, lic["key"])
    assert missing.json()["valid"] is False


def test_lenient_mode_allows_with_grace(client, auth_headers):
    _product, lic = _make_locked_license(client, auth_headers)
    put = client.put(
        "/api/settings/license-security",
        json={"strictness": "lenient"},
        headers=auth_headers,
    )
    assert put.status_code == 200
    assert put.json()["strictness"] == "lenient"
    bad = _validate(client, auth_headers, lic["key"], domain="evil.com")
    assert bad.json()["valid"] is True
    assert bad.json()["grace"] is True
    assert bad.json()["warnings"]


def test_missing_lock_allow(client, auth_headers):
    _product, lic = _make_locked_license(client, auth_headers)
    client.put(
        "/api/settings/license-security",
        json={"missing_lock_behavior": "allow"},
        headers=auth_headers,
    )
    missing = _validate(client, auth_headers, lic["key"])
    assert missing.json()["valid"] is True
    assert missing.json()["warnings"]


def test_domain_lock_toggle_off(client, auth_headers):
    _product, lic = _make_locked_license(client, auth_headers)
    client.put(
        "/api/settings/license-security",
        json={"enforce_domain_lock": False},
        headers=auth_headers,
    )
    bad = _validate(client, auth_headers, lic["key"], domain="evil.com")
    assert bad.json()["valid"] is True
    assert bad.json()["warnings"] == []


def test_per_product_override_beats_global(client, auth_headers):
    product, lic = _make_locked_license(client, auth_headers)
    # Global is strict, but this product overrides to lenient.
    updated = client.put(
        f"/api/products/{product['id']}",
        json={"security_overrides": {"strictness": "lenient"}},
        headers=auth_headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["security_overrides"] == {"strictness": "lenient"}
    bad = _validate(client, auth_headers, lic["key"], domain="evil.com")
    assert bad.json()["valid"] is True
    assert bad.json()["grace"] is True


def test_license_security_config_roundtrip(client, auth_headers):
    get = client.get("/api/settings/license-security", headers=auth_headers)
    assert get.status_code == 200
    assert get.json()["strictness"] == "strict"
    assert get.json()["missing_lock_behavior"] == "deny"
    put = client.put(
        "/api/settings/license-security",
        json={
            "strictness": "lenient",
            "enforce_ip_lock": False,
            "missing_lock_behavior": "allow",
        },
        headers=auth_headers,
    )
    assert put.status_code == 200
    assert put.json()["enforce_ip_lock"] is False
    # Invalid values fall back to defaults instead of opening holes.
    put2 = client.put(
        "/api/settings/license-security",
        json={"strictness": "wide-open", "missing_lock_behavior": "maybe"},
        headers=auth_headers,
    )
    assert put2.json()["strictness"] == "lenient"  # previous value kept
    assert put2.json()["missing_lock_behavior"] == "allow"


def test_activation_limit_toggle(client, auth_headers):
    product = client.post(
        "/api/products",
        json={"name": "ActProd", "billing_cycles": ["monthly"], "price": 1},
        headers=auth_headers,
    ).json()
    lic = client.post(
        "/api/licenses",
        json={
            "product": "ActProd",
            "key": "SEC-ACT-0001",
            "product_id": product["id"],
            "billing_cycle": "monthly",
            "max_activations": 1,
        },
        headers=auth_headers,
    ).json()
    # First activation uses the only slot.
    assert (
        client.post(
            f"/api/licenses/{lic['id']}/activations",
            json={"fingerprint": "machine-1"},
            headers=auth_headers,
        ).status_code
        == 201
    )
    # Second activation is refused while the limit is enforced...
    assert (
        client.post(
            f"/api/licenses/{lic['id']}/activations",
            json={"fingerprint": "machine-2"},
            headers=auth_headers,
        ).status_code
        == 400
    )
    # ...and allowed once the limit is switched off.
    client.put(
        "/api/settings/license-security",
        json={"enforce_activation_limit": False},
        headers=auth_headers,
    )
    assert (
        client.post(
            f"/api/licenses/{lic['id']}/activations",
            json={"fingerprint": "machine-2"},
            headers=auth_headers,
        ).status_code
        == 201
    )
