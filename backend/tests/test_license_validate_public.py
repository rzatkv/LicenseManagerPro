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
    """(b) A blacklisted IP or domain is rejected, auth or no auth."""
    lic = _make_license(client, auth_headers)
    for type_, value in (("ip", "203.0.113.0/24"), ("domain", "blocked.example.com")):
        added = client.post(
            "/api/blacklist",
            json={"type": type_, "value": value},
            headers=auth_headers,
        )
        assert added.status_code == 201, added.text
    ip_blocked = client.post(
        "/api/licenses/validate", json={"key": lic["key"], "ip": "203.0.113.99"}
    )
    assert ip_blocked.status_code == 200
    assert ip_blocked.json() == {
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
    """(d) Domain/IP locks are enforced for anonymous callers too."""
    lic = _make_license(
        client,
        auth_headers,
        allowed_domains=["allowed.example.com"],
        allowed_ips=["198.51.100.7"],
    )
    wrong_domain = client.post(
        "/api/licenses/validate",
        json={"key": lic["key"], "domain": "other.example.com"},
    )
    assert wrong_domain.status_code == 200
    assert wrong_domain.json()["valid"] is False
    assert wrong_domain.json()["detail"] == "domain not allowed"
    wrong_ip = client.post(
        "/api/licenses/validate",
        json={
            "key": lic["key"],
            # The allowed domain must be supplied here: without it the
            # domain lock (missing) denies first with "domain not
            # allowed" and the IP lock is never reached.
            "domain": "allowed.example.com",
            "ip": "198.51.100.8",
        },
    )
    assert wrong_ip.status_code == 200
    assert wrong_ip.json()["valid"] is False
    assert wrong_ip.json()["detail"] == "ip not allowed"
    good = client.post(
        "/api/licenses/validate",
        json={"key": lic["key"], "domain": "allowed.example.com", "ip": "198.51.100.7"},
    )
    assert good.status_code == 200
    assert good.json()["valid"] is True
