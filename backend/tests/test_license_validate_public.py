"""Public license check (v3.0): POST /api/licenses/validate needs no API
key and no JWT — any server may call it. The blacklist, the license
locks and the 60/min per-IP rate limit still apply."""


def _make_license(client, auth_headers, key="LIC-PUB-0001", **overrides):
    body = {"product": "Widget", "key": key}
    body.update(overrides)
    response = client.post("/api/licenses", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_validate_works_with_no_auth_at_all(client, auth_headers):
    """(a) A license check with neither an API key nor a JWT succeeds."""
    lic = _make_license(client, auth_headers)
    response = client.post("/api/licenses/validate", json={"key": lic["key"]})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["valid"] is True
    assert body["detail"] == "License is valid"
    # Unknown keys still answer (no auth wall), with the same shape.
    missing = client.post("/api/licenses/validate", json={"key": "LIC-NOPE-0000"})
    assert missing.status_code == 200
    assert missing.json()["valid"] is False
    assert missing.json()["detail"] == "License key not found"


def test_validate_blacklist_still_applies_without_auth(client, auth_headers):
    """(b) A blacklisted IP or domain is rejected, auth or no auth.

    The IP blacklist is enforced against the OBSERVED connection IP
    (v3.0.6, H2): the TestClient presents itself as "testclient", so a
    blacklisted range cannot be exercised through the route — the
    route-level check below proves a spoofed blacklisted body `ip`
    does NOT block a clean caller, and the service-level check proves
    the blacklist itself still bites for a matching observed IP."""
    lic = _make_license(client, auth_headers)
    for type_, value in (("ip", "203.0.113.0/24"), ("domain", "blocked.example.com")):
        added = client.post(
            "/api/blacklist",
            json={"type": type_, "value": value},
            headers=auth_headers,
        )
        assert added.status_code == 201, added.text
    # Spoofing a blacklisted IP in the body does not block: the
    # observed IP ("testclient") is clean.
    spoof = client.post(
        "/api/licenses/validate", json={"key": lic["key"], "ip": "203.0.113.99"}
    )
    assert spoof.status_code == 200
    assert spoof.json()["valid"] is True, spoof.text
    # The blacklist itself still bites when the observed IP matches
    # (service level — the route passes request.client.host there).
    from database import SessionLocal
    from services import licenses as license_service

    db = SessionLocal()
    try:
        blocked = license_service.validate_license(lic["key"], db, ip="203.0.113.99")
    finally:
        db.close()
    assert blocked == {
        "valid": False,
        "detail": "blocked: blacklisted",
        "license": None,
        "grace": False,
        "warnings": [],
    }
    domain_blocked = client.post(
        "/api/licenses/validate",
        json={"key": lic["key"], "domain": "blocked.example.com"},
    )
    assert domain_blocked.status_code == 200
    assert domain_blocked.json()["detail"] == "blocked: blacklisted"


def test_validate_rate_limit_still_applies_without_auth(client, auth_headers):
    """(c) The 60/min per-IP limit holds on the now-public endpoint."""
    lic = _make_license(client, auth_headers)
    last = None
    for _ in range(61):
        last = client.post("/api/licenses/validate", json={"key": lic["key"]})
    assert last.status_code == 429, last.text


def test_validate_locks_still_enforced_without_auth(client, auth_headers):
    """(d) Domain/IP locks are enforced for anonymous callers too.

    The IP lock is enforced against the OBSERVED connection IP
    (v3.0.6, H2) — the TestClient presents itself as "testclient",
    so the lock lists that host. A body `ip` claiming a locked
    address does not satisfy the lock (H2 regression)."""
    lic = _make_license(
        client,
        auth_headers,
        allowed_domains=["allowed.example.com"],
        allowed_ips=["testclient"],
    )
    wrong_domain = client.post(
        "/api/licenses/validate",
        json={"key": lic["key"], "domain": "other.example.com"},
    )
    assert wrong_domain.status_code == 200
    assert wrong_domain.json()["valid"] is False
    assert wrong_domain.json()["detail"] == "domain not allowed"
    # The observed IP ("testclient") matches, so a wrong body ip is
    # ignored and validation still passes.
    wrong_body_ip = client.post(
        "/api/licenses/validate",
        json={
            "key": lic["key"],
            "domain": "allowed.example.com",
            "ip": "198.51.100.8",
        },
    )
    assert wrong_body_ip.status_code == 200
    assert wrong_body_ip.json()["valid"] is True, wrong_body_ip.text
    good = client.post(
        "/api/licenses/validate",
        json={"key": lic["key"], "domain": "allowed.example.com"},
    )
    assert good.status_code == 200
    assert good.json()["valid"] is True
    # Spoof: a license locked to 198.51.100.7 stays denied even when
    # the caller claims that IP in the body.
    lic2 = _make_license(
        client,
        auth_headers,
        key="LIC-PUB-0002",
        allowed_domains=["allowed.example.com"],
        allowed_ips=["198.51.100.7"],
    )
    spoof = client.post(
        "/api/licenses/validate",
        json={"key": lic2["key"], "domain": "allowed.example.com", "ip": "198.51.100.7"},
    )
    assert spoof.status_code == 200
    assert spoof.json()["valid"] is False
    assert spoof.json()["detail"] == "ip not allowed"


def test_validate_response_hides_owner_and_lock_material(client, auth_headers):
    """v3.0.6 (security, M2): the PUBLIC validate endpoint used to return
    the full license record — owner email, notes, allowed domains/IPs
    and install path — to anyone holding (or guessing) a key. Now it
    returns only the fields modules actually use (status, expiry,
    activation counts); the sensitive fields must be absent."""
    lic = _make_license(
        client,
        auth_headers,
        owner_email="secret-owner@example.com",
        notes="internal note — do not leak",
        allowed_domains=["allowed.example.com"],
        allowed_ips=["testclient"],  # the TestClient's observed IP, so the IP lock passes
        install_path="/var/www/app",
    )
    response = client.post(
        "/api/licenses/validate",
        json={
            "key": lic["key"],
            "domain": "allowed.example.com",
            "install_path": "/var/www/app",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["valid"] is True
    info = body["license"]
    assert info is not None
    for leaked in ("owner_email", "notes", "allowed_domains", "allowed_ips", "install_path", "key", "id", "reissue_count"):
        assert leaked not in info, f"validate leaked {leaked}"
    # The fields modules actually use stay.
    assert info["status"] == "active"
    assert info["max_activations"] == lic["max_activations"]
    assert info["activations"] == lic["activations"]
    assert info["product"] == "Widget"
